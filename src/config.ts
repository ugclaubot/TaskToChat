import path from 'path';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
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
    path: path.resolve(process.env.DB_PATH || './data/tasktochat.db'),
  },
  timezone: process.env.TIMEZONE || 'Asia/Kolkata',
  logLevel: process.env.LOG_LEVEL || 'info',
};
