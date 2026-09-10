import cron from 'node-cron';
import { getDb } from '../db.js';
import { formatRenewalMessage, sendTelegramMessage } from './telegram.service.js';
import { advanceToNextFutureRenewal } from '../utils/rollover.js';

export function calculateTomorrow(referenceDateStr) {
  const [y, m, d] = referenceDateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function autoAdvancePassedSubscriptions(todayStr = new Date().toISOString().slice(0, 10)) {
  const today = typeof todayStr === 'string' && todayStr.length > 10 ? todayStr.slice(0, 10) : todayStr;
  const db = getDb();
  const pastSubs = db.prepare('SELECT * FROM subscriptions WHERE is_active = 1 AND next_renewal_date < ?').all(today);

  for (const sub of pastSubs) {
    const nextDate = advanceToNextFutureRenewal(sub.next_renewal_date, sub.billing_cycle, today);
    db.prepare(`
      UPDATE subscriptions SET
        next_renewal_date = ?,
        last_notified_renewal_date = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nextDate, sub.id);
  }
}

export const advancePassedSubscriptions = autoAdvancePassedSubscriptions;

export async function checkUpcomingRenewals(options = {}) {
  const db = getDb();
  const today = options.referenceDate || (options.nowIso ? options.nowIso.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const targetRenewalDate = calculateTomorrow(today);

  // Auto-advance any subscriptions whose renewal date has already passed
  autoAdvancePassedSubscriptions(today);

  // Fetch settings for telegram token & chat ID
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() || {};
  const botToken = settings.telegram_bot_token || options.telegramBotToken || '';
  const chatId = settings.telegram_chat_id || options.telegramChatId || '';

  // Find active subscriptions renewing tomorrow that haven't been notified for this cycle
  const candidates = db.prepare(`
    SELECT * FROM subscriptions
    WHERE is_active = 1
      AND next_renewal_date = ?
      AND (last_notified_renewal_date IS NULL OR last_notified_renewal_date != ?)
  `).all(targetRenewalDate, targetRenewalDate);

  let notifiedCount = 0;
  const errors = [];
  const sender = options.mockSender || sendTelegramMessage;

  for (const sub of candidates) {
    if (options.dryRun) {
      notifiedCount++;
      continue;
    }

    const msg = formatRenewalMessage(sub);
    const res = await sender({ botToken, chatId, message: msg });

    if (res.ok) {
      // Mark as notified for this cycle
      db.prepare(`
        UPDATE subscriptions SET
          last_notified_renewal_date = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(targetRenewalDate, sub.id);

      // Log success
      db.prepare(`
        INSERT INTO notification_logs (subscription_id, subscription_name, renewal_date, status)
        VALUES (?, ?, ?, 'SUCCESS')
      `).run(sub.id, sub.name, targetRenewalDate);

      notifiedCount++;
    } else {
      errors.push(`Failed to notify ${sub.name}: ${res.error}`);
      db.prepare(`
        INSERT INTO notification_logs (subscription_id, subscription_name, renewal_date, status, error_message)
        VALUES (?, ?, ?, 'FAILED', ?)
      `).run(sub.id, sub.name, targetRenewalDate, res.error);
    }
  }

  return { notifiedCount, errors };
}

export function startScheduler(config = {}) {
  // Check immediately on startup
  checkUpcomingRenewals({
    telegramBotToken: config.telegramBotToken,
    telegramChatId: config.telegramChatId
  }).catch(err => console.error('[Scheduler] Initial run error:', err));

  // Run every hour at minute 0: "0 * * * *"
  const task = cron.schedule('0 * * * *', async () => {
    try {
      const { notifiedCount, errors } = await checkUpcomingRenewals({
        telegramBotToken: config.telegramBotToken,
        telegramChatId: config.telegramChatId
      });
      if (notifiedCount > 0) {
        console.log(`[Scheduler] Sent ${notifiedCount} Telegram renewal alerts.`);
      }
      if (errors.length > 0) {
        console.error('[Scheduler] Errors:', errors);
      }
    } catch (err) {
      console.error('[Scheduler] Cron execution failed:', err);
    }
  });

  return task;
}
