import { settleTelegramOrders } from '../services/telegram.service.js';

/* Follows Telegram orders GramSubs has not delivered yet. Sandbox and most live orders deliver at once, so a minute is plenty. */
const INTERVAL_MS = 60 * 1000;

/** Start the job. Returns a function that stops it. */
export function startTelegramJob(): () => void {
  let running = false;
  const tick = async () => {
    if (running) return; // the last run is still going: don't pile up
    running = true;
    try {
      const { looked, settled } = await settleTelegramOrders();
      if (settled > 0) console.log(`[telegram job] looked at ${looked} open order(s), finished ${settled}`);
    } catch (err) {
      console.error('[telegram job] run failed:', err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
