import 'dotenv/config';
import { initDb } from './database';
import { createBot, startBot } from './bot/index';
import { setupCron } from './reminders/cron';
import { createServer, startServer } from './web/server';

async function main(): Promise<void> {
  console.log('[TaskToChat] Starting...');

  // Initialize database
  initDb();

  // Start web dashboard
  const app = createServer();
  startServer(app);

  // Create and configure Telegram bot
  const bot = createBot();

  // Setup cron jobs (pass bot for Telegram notifications)
  setupCron(bot);

  // Launch Telegram bot (long-polling)
  await startBot(bot);

  console.log('[TaskToChat] All systems running.');
}

main().catch((err) => {
  console.error('[TaskToChat] Fatal startup error:', err);
  process.exit(1);
});
