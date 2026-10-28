import { settleBoostOrders } from '../services/boostOrders.service.js';

/*
 * The boost job: follows open boost orders at their panels and records the result (and any refund) in our database.
 * The page never asks a panel anything: it reads what this job has written. Orders take hours or days, so once a minute is plenty.
 */
const INTERVAL_MS = 60 * 1000;

/** Start the job. Returns a function that stops it. */
export function startBoostJob(): () => void {
  let running = false;
  const tick = async () => {
    if (running) return; // the last run is still going: don't pile up
    running = true;
    try {
      const { looked, settled } = await settleBoostOrders();
      if (settled > 0) console.log(`[boost job] looked at ${looked} open order(s), finished ${settled}`);
    } catch (err) {
      console.error('[boost job] run failed:', err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
