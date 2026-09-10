import crypto from 'node:crypto';

export function loadConfig(env = process.env) {
  return {
    port: parseInt(env.PORT || '3000', 10),
    dbPath: env.DB_PATH || './data/subscriptions.db',
    appPassword: env.APP_PASSWORD || 'admin',
    sessionSecret: env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: env.TELEGRAM_CHAT_ID || '',
    notifyHoursBefore: parseInt(env.NOTIFY_HOURS_BEFORE || '24', 10),
  };
}

export const config = loadConfig(process.env);
