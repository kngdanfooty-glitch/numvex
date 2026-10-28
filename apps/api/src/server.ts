import { buildApp } from './app.js';
import { env } from './config/env.js';
import { connectMongo, disconnectMongo } from './db/mongoose.js';
import { loadSettings } from './services/settings.service.js';
import { startBoostJob } from './jobs/boostJob.js';
import { startRentalJob } from './jobs/rentalJob.js';
import { startTelegramJob } from './jobs/telegramJob.js';
import { startPollJob } from './jobs/pollJob.js';
import { startRefundJob } from './jobs/refundJob.js';

async function main() {
  await connectMongo();
  await loadSettings(); // prices and service switches saved from the admin panel

  const app = buildApp();
  const server = app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`);
  });

  // The page only reads the database. These two are what talk to the number providers:
  const stopPollJob = startPollJob(); // every 15s: asks each waiting number's provider for its code
  const stopRentalJob = startRentalJob(); // every 30s: new messages on rented numbers, closes ended rentals
  const stopTelegramJob = startTelegramJob(); // every minute: follows Telegram orders the supplier has not delivered yet (status, refunds)
  const stopBoostJob = startBoostJob(); // every minute: follows open boost orders at their panels (status, refunds)
  const stopRefundJob = startRefundJob(); // every minute: settles numbers that expired without a code (refund)

  // Close cleanly on Ctrl+C / deploy restarts.
  const shutdown = () => {
    stopPollJob();
    stopBoostJob();
    stopTelegramJob();
    stopRentalJob();
    stopRefundJob();
    server.close(async () => {
      await disconnectMongo();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start API:', err);
  process.exit(1);
});
