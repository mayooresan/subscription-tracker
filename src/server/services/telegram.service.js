export function formatRenewalMessage(subscription) {
  const { name, price, billing_cycle, next_renewal_date, category, url } = subscription;
  const currency = subscription.currency || '$';
  return [
    `🔔 *Subscription Renewal Reminder*`,
    ``,
    `Your subscription for *${name}* will renew in 24 hours!`,
    ``,
    `💵 *Cost:* ${currency}${Number(price).toFixed(2)} (${billing_cycle})`,
    `📅 *Renewal Date:* ${next_renewal_date}`,
    `📂 *Category:* ${category || 'General'}`,
    url ? `🔗 *Manage Subscription:* ${url}` : null,
    ``,
    `_Sent from your Subscription Tracker_`
  ].filter(Boolean).join('\n');
}

export async function sendTelegramMessage({ botToken, chatId, message } = {}) {
  if (!botToken || !chatId) {
    return { ok: false, error: 'Missing Telegram bot token or chat ID' };
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok || !data || !data.ok) {
      return { ok: false, error: (data && data.description) || `Telegram API error: ${response.status}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
