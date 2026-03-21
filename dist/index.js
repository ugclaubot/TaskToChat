"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const database_1 = require("./database");
const index_1 = require("./bot/index");
const cron_1 = require("./reminders/cron");
const server_1 = require("./web/server");
async function main() {
    console.log('[TaskToChat] Starting...');
    // Initialize database
    (0, database_1.initDb)();
    // Start web dashboard
    const app = (0, server_1.createServer)();
    (0, server_1.startServer)(app);
    // Create and configure Telegram bot
    const bot = (0, index_1.createBot)();
    // Setup cron jobs (pass bot for Telegram notifications)
    (0, cron_1.setupCron)(bot);
    // Launch Telegram bot (long-polling)
    await (0, index_1.startBot)(bot);
    console.log('[TaskToChat] All systems running.');
}
main().catch((err) => {
    console.error('[TaskToChat] Fatal startup error:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map