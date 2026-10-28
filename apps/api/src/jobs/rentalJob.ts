import { runRentalSweep } from '../services/rentals.service.js';

/* Fetches new messages for every active rental and closes rentals whose time is up. The page only reads our database. */
const INTERVAL_MS = 30 * 1000;

/** Start the job. Returns a function that stops it. */
export function startRentalJob(): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { newMessages, expired } = await runRentalSweep();
      if (newMessages > 0 || expired > 0) console.log(`[rental job] ${newMessages} new message(s), ${expired} rental(s) ended`);
    } catch (err) {
      console.error('[rental job] run failed:', err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
