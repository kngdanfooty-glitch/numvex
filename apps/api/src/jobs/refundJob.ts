import { Activation } from '../models/Activation.js';
import { buyableServers, settleActivation } from '../services/numbers.service.js';

/*
 * The refund job (FloZap's refundChecker). Users who close the page, or whose browser dies, never trigger a
 * check, so this looks at every number that expired without a code and settles it: refund once the provider
 * confirms it cancelled, or complete it if the code arrived after all. Safe to run twice: refunds are claimed with
 * an atomic pending -> cancelled flip, so a number can never be refunded two times.
 */
const INTERVAL_MS = 15 * 1000; // a number is cancelled within about 15 seconds of its countdown ending
const GRACE_MS = 5 * 1000; // a few seconds past expiry; settleActivation also looks at the provider once more, so a code that is just landing is completed, not refunded
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // older than a day is odd (needs a person), so it is left alone like FloZap does
const BATCH = 25;

export async function runRefundSweep(now = new Date()): Promise<{ looked: number; settled: number }> {
  const due = await Activation.find({
    status: 'pending',
    server: { $in: buyableServers() },
    expiresAt: { $lt: new Date(now.getTime() - GRACE_MS), $gte: new Date(now.getTime() - MAX_AGE_MS) },
  })
    .sort({ expiresAt: 1 })
    .limit(BATCH);

  let settled = 0;
  for (const activation of due) {
    try {
      const after = await settleActivation(activation);
      if (after.status !== 'pending') settled++;
    } catch (err) {
      console.error(`[refund job] activation ${activation._id} failed:`, err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, 100)); // be gentle with the providers
  }
  return { looked: due.length, settled };
}

/** Start the job. Returns a function that stops it. */
export function startRefundJob(): () => void {
  let running = false;
  const tick = async () => {
    if (running) return; // the last run is still going: don't pile up
    running = true;
    try {
      const { looked, settled } = await runRefundSweep();
      if (settled > 0) console.log(`[refund job] looked at ${looked} expired number(s), settled ${settled}`);
    } catch (err) {
      console.error('[refund job] sweep failed:', err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref(); // never keeps the process alive on its own
  return () => clearInterval(timer);
}
