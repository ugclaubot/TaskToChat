"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const path_1 = __importDefault(require("path"));
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
exports.config = {
    telegram: {
        botToken: requireEnv('TELEGRAM_BOT_TOKEN'),
    },
    manager: {
        telegramId: process.env.MANAGER_TELEGRAM_ID || '',
        name: process.env.MANAGER_NAME || 'Udit',
        whatsapp: process.env.MANAGER_WHATSAPP || '',
    },
    web: {
        port: parseInt(process.env.PORT || '3000', 10),
    },
    db: {
        path: path_1.default.resolve(process.env.DB_PATH || './data/tasktochat.db'),
    },
    timezone: process.env.TIMEZONE || 'Asia/Kolkata',
    logLevel: process.env.LOG_LEVEL || 'info',
};
//# sourceMappingURL=config.js.map