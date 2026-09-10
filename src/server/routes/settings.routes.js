import { Router } from 'express';
import { getDb } from '../db.js';
import { sendTelegramMessage } from '../services/telegram.service.js';

export function createSettingsRouter(config = {}) {
  const router = Router();

  router.get('/settings', (req, res) => {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() || {};
    
    // Fall back to config if DB values are not yet set
    const token = settings.telegram_bot_token || config.telegramBotToken || '';
    const chatId = settings.telegram_chat_id || config.telegramChatId || '';
    
    // Mask token for security
    const maskedToken = token ? (token.length > 8 ? `${token.slice(0, 4)}...${token.slice(-4)}` : '****') : '';

    res.json({
      telegram_bot_token_masked: maskedToken,
      has_token: Boolean(token),
      telegram_chat_id: chatId,
      notify_hours_before: settings.notify_hours_before || config.notifyHoursBefore || 24,
      currency_symbol: settings.currency_symbol || '$'
    });
  });

  router.put('/settings', (req, res) => {
    const db = getDb();
    const { telegram_bot_token, telegram_chat_id, notify_hours_before, currency_symbol } = req.body || {};

    const current = db.prepare('SELECT * FROM settings WHERE id = 1').get() || {};

    // If token passed is empty or omitted, keep current
    const tokenToSave = telegram_bot_token !== undefined && telegram_bot_token !== ''
      ? telegram_bot_token 
      : (current.telegram_bot_token ?? null);

    db.prepare(`
      UPDATE settings SET
        telegram_bot_token = ?,
        telegram_chat_id = COALESCE(?, telegram_chat_id),
        notify_hours_before = COALESCE(?, notify_hours_before),
        currency_symbol = COALESCE(?, currency_symbol),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      tokenToSave,
      telegram_chat_id !== undefined ? telegram_chat_id : null,
      notify_hours_before !== undefined ? notify_hours_before : null,
      currency_symbol !== undefined ? currency_symbol : null
    );

    res.json({ success: true, message: 'Settings updated' });
  });

  router.post('/settings/test-telegram', async (req, res) => {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() || {};
    const botToken = req.body?.telegram_bot_token || settings.telegram_bot_token || config.telegramBotToken;
    const chatId = req.body?.telegram_chat_id || settings.telegram_chat_id || config.telegramChatId;

    const testMsg = `🚀 *Subscription Tracker Test Alert*\n\nYour Telegram notification configuration is working successfully!`;
    const result = await sendTelegramMessage({ botToken, chatId, message: testMsg });

    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, message: 'Test message delivered to Telegram' });
  });

  router.get('/notifications/logs', (req, res) => {
    const db = getDb();
    const logs = db.prepare('SELECT * FROM notification_logs ORDER BY sent_at DESC LIMIT 50').all();
    res.json(logs);
  });

  return router;
}
