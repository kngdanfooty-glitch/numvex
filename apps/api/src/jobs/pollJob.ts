import { Activation } from '../models/Activation.js';
import { isBusy, retryAfterSec } from '../lib/providerFetch.js';
import { buyableServers, settleActivation } from '../services/numbers.service.js';

/*
 * The poll job (FloZap's pollSmsJob). The page never asks a provider anything: it reads our database. THIS is what
 * asks the providers, for every number still waiting, and writes what it learns (code arrived, provider cancelled)
 * into the database for the page to read. Numbers that have expired are the refund job's business.
 */
const INTERVAL_MS = 15 * 1000;
const POLL_EVERY_MS = 12 * 1000; // ask about any one number at most this often (a little under the tick, so timer jitter never skips a turn)
const BATCH = 50;
const PER_SERVER_PER_RUN = 20; // so one busy server can't spend its whole rate-limit budget (some providers allow only about 100 calls a minute per key)
const DEFAULT_COOLDOWN_MS = 60 * 1000;

/** server -> time until which we leave it alone, because it told us to slow down. */
const cooldown = new Map<string, number>();

/** For tests: forget every cooldown. */
export function resetPollCooldowns() {
  cooldown.clear();
}

export async function runPollSweep(now = new Date()): Promise<{ polled: number; settled: number }> {
  const due = await Activation.find({
    status: 'pending',
    server: { $in: buyableServers() },
    expiresAt: { $gte: now },
    $or: [{ lastPolledAt: { $exists: false } }, { lastPolledAt: { $lt: new Date(now.getTime() - POLL_EVERY_MS) } }],
  })
    .sort({ lastPolledAt: 1 }) // never-polled first, then the one waiting longest: everyone gets a turn
    .limit(BATCH);

  let polled = 0;
  let settled = 0;
  const perServer = new Map<string, number>();
  for (const candidate of due) {
    const server = candidate.server;
    if ((cooldown.get(server) ?? 0) > now.getTime()) continue; // it asked us to slow down: don't even claim the number
    if ((perServer.get(server) ?? 0) >= PER_SERVER_PER_RUN) continue; // over this server's share: first in line next run
    // Claim it (atomic) so a second server instance, or an overlapping run, doesn't poll the same number.
    const claimed = await Activation.findOneAndUpdate(
      {
        _id: candidate._id,
        status: 'pending',
        $or: [{ lastPolledAt: { $exists: false } }, { lastPolledAt: { $lt: new Date(now.getTime() - POLL_EVERY_MS) } }],
      },
      { lastPolledAt: now },
      { new: true },
    );
    if (!claimed) continue;
    polled++;
    perServer.set(server, (perServer.get(server) ?? 0) + 1);
    try {
      const after = await settleActivation(claimed);
      if (after.status !== 'pending') settled++;
    } catch (err) {
      if (isBusy(err)) {
        // Rate limited: pause this one server (others carry on). Nothing is refunded or lost; it is asked again later.
        const ms = (retryAfterSec(err) ?? DEFAULT_COOLDOWN_MS / 1000) * 1000;
        cooldown.set(server, now.getTime() + ms);
        console.warn(`[poll job] ${server} is rate limiting us; pausing it for ${Math.round(ms / 1000)}s`);
      } else {
        console.error(`[poll job] activation ${claimed._id} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }
  return { polled, settled };
}

/** Start the job. Returns a function that stops it. */
export function startPollJob(): () => void {
  let running = false;
  const tick = async () => {
    if (running) return; // the last run is still going: don't pile up
    running = true;
    try {
      await runPollSweep();
    } catch (err) {
      console.error('[poll job] sweep failed:', err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
