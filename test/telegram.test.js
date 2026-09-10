import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import supertest from 'supertest';
import fs from 'node:fs';
import { initDb, closeDb, getDb } from '../src/server/db.js';
import { formatRenewalMessage, sendTelegramMessage } from '../src/server/services/telegram.service.js';
import { createSettingsRouter } from '../src/server/routes/settings.routes.js';

const TEST_DB = './data/test-settings-api.db';
let app;
const origFetch = global.fetch;

before(() => {
  if (fs.existsSync(TEST_DB)) {
    fs.rmSync(TEST_DB, { force: true });
  }
  initDb(TEST_DB);
  app = express();
  app.use(express.json());
  app.use('/api', createSettingsRouter({
    telegramBotToken: 'config-bot-token-12345',
    telegramChatId: 'config-chat-id-67890',
    notifyHoursBefore: 24
  }));
});

after(() => {
  global.fetch = origFetch;
  closeDb();
  if (fs.existsSync(TEST_DB)) {
    fs.rmSync(TEST_DB, { force: true });
  }
  const walFile = `${TEST_DB}-wal`;
  const shmFile = `${TEST_DB}-shm`;
  if (fs.existsSync(walFile)) fs.rmSync(walFile, { force: true });
  if (fs.existsSync(shmFile)) fs.rmSync(shmFile, { force: true });
});

test('formatRenewalMessage generates markdown alert with subscription details', () => {
  const sub = {
    name: 'Spotify Premium',
    price: 10.99,
    currency: 'USD',
    billing_cycle: 'monthly',
    next_renewal_date: '2026-09-11',
    category: 'Music'
  };

  const message = formatRenewalMessage(sub);
  assert.ok(message.includes('Spotify Premium'));
  assert.ok(message.includes('$10.99 (monthly)') || message.includes('10.99'));
  assert.ok(message.includes('2026-09-11'));
  assert.ok(message.includes('Music'));
});

test('formatRenewalMessage includes url if present and defaults category if absent', () => {
  const subWithUrl = {
    name: 'Netflix',
    price: 15.49,
    billing_cycle: 'monthly',
    next_renewal_date: '2026-09-15',
    url: 'https://netflix.com/account'
  };

  const message = formatRenewalMessage(subWithUrl);
  assert.ok(message.includes('https://netflix.com/account'));
  assert.ok(message.includes('General'));
});

test('sendTelegramMessage returns error if botToken or chatId is missing', async () => {
  const res = await sendTelegramMessage({ botToken: '', chatId: '', message: 'Test' });
  assert.equal(res.ok, false);
  assert.ok(res.error.includes('Missing'));

  const res2 = await sendTelegramMessage({ botToken: 'some-token', chatId: '', message: 'Test' });
  assert.equal(res2.ok, false);
  assert.ok(res2.error.includes('Missing'));

  const res3 = await sendTelegramMessage({ botToken: '', chatId: '12345', message: 'Test' });
  assert.equal(res3.ok, false);
  assert.ok(res3.error.includes('Missing'));
});

test('sendTelegramMessage successfully sends message when fetch succeeds', async () => {
  let calledUrl = '';
  let calledBody = null;

  global.fetch = async (url, options) => {
    calledUrl = url;
    calledBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 101 } })
    };
  };

  const res = await sendTelegramMessage({
    botToken: 'my-bot-token',
    chatId: '123456789',
    message: 'Test message body'
  });

  assert.equal(res.ok, true);
  assert.equal(calledUrl, 'https://api.telegram.org/botmy-bot-token/sendMessage');
  assert.equal(calledBody.chat_id, '123456789');
  assert.equal(calledBody.text, 'Test message body');
  assert.equal(calledBody.parse_mode, 'Markdown');
});

test('sendTelegramMessage returns error when Telegram API returns failure', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ ok: false, description: 'Bad Request: chat not found' })
  });

  const res = await sendTelegramMessage({
    botToken: 'my-bot-token',
    chatId: 'invalid-id',
    message: 'Test'
  });

  assert.equal(res.ok, false);
  assert.equal(res.error, 'Bad Request: chat not found');
});

test('sendTelegramMessage returns error on network failure', async () => {
  global.fetch = async () => {
    throw new Error('Connection refused');
  };

  const res = await sendTelegramMessage({
    botToken: 'my-bot-token',
    chatId: '12345',
    message: 'Test'
  });

  assert.equal(res.ok, false);
  assert.equal(res.error, 'Connection refused');
});

test('GET /api/settings returns settings with masked token and config fallbacks', async () => {
  const res = await supertest(app)
    .get('/api/settings')
    .expect(200);

  assert.equal(res.body.telegram_chat_id, 'config-chat-id-67890');
  assert.equal(res.body.has_token, true);
  assert.equal(res.body.telegram_bot_token_masked, 'conf...2345');
  assert.equal(res.body.notify_hours_before, 24);
  assert.equal(res.body.currency_symbol, '$');
});

test('PUT /api/settings updates settings and preserves bot token if omitted or empty', async () => {
  // Update token first
  await supertest(app)
    .put('/api/settings')
    .send({
      telegram_bot_token: '1234567890:ABCDEFGHIJ',
      telegram_chat_id: 'chat-999',
      notify_hours_before: 48,
      currency_symbol: '€'
    })
    .expect(200);

  let res = await supertest(app)
    .get('/api/settings')
    .expect(200);

  assert.equal(res.body.telegram_chat_id, 'chat-999');
  assert.equal(res.body.has_token, true);
  assert.equal(res.body.telegram_bot_token_masked, '1234...GHIJ');
  assert.equal(res.body.notify_hours_before, 48);
  assert.equal(res.body.currency_symbol, '€');

  // Update without passing telegram_bot_token (or passing empty string)
  await supertest(app)
    .put('/api/settings')
    .send({
      telegram_bot_token: '',
      telegram_chat_id: 'chat-888',
      notify_hours_before: 12
    })
    .expect(200);

  res = await supertest(app)
    .get('/api/settings')
    .expect(200);

  assert.equal(res.body.telegram_chat_id, 'chat-888');
  assert.equal(res.body.notify_hours_before, 12);
  assert.equal(res.body.currency_symbol, '€');
  // Token should still be preserved
  assert.equal(res.body.has_token, true);
  assert.equal(res.body.telegram_bot_token_masked, '1234...GHIJ');
});

test('GET /api/settings handles short tokens (<= 8 characters) with ****', async () => {
  await supertest(app)
    .put('/api/settings')
    .send({ telegram_bot_token: 'short' })
    .expect(200);

  const res = await supertest(app)
    .get('/api/settings')
    .expect(200);

  assert.equal(res.body.telegram_bot_token_masked, '****');
});

test('POST /api/settings/test-telegram sends test notification', async () => {
  let sentMsg = '';
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    sentMsg = body.text;
    return {
      ok: true,
      json: async () => ({ ok: true })
    };
  };

  const res = await supertest(app)
    .post('/api/settings/test-telegram')
    .send({
      telegram_bot_token: 'valid-test-token',
      telegram_chat_id: 'test-chat'
    })
    .expect(200);

  assert.equal(res.body.success, true);
  assert.ok(sentMsg.includes('Subscription Tracker Test Alert'));
});

test('POST /api/settings/test-telegram returns 400 on failure', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ ok: false, description: 'Unauthorized' })
  });

  const res = await supertest(app)
    .post('/api/settings/test-telegram')
    .send({
      telegram_bot_token: 'bad-token',
      telegram_chat_id: 'test-chat'
    })
    .expect(400);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'Unauthorized');
});

test('GET /api/notifications/logs retrieves recent logs', async () => {
  const db = getDb();
  db.prepare(`
    INSERT INTO notification_logs (subscription_name, renewal_date, status, error_message, sent_at)
    VALUES ('GitHub Copilot', '2026-09-12', 'SUCCESS', NULL, '2026-09-10 10:00:00'),
           ('Vercel Pro', '2026-09-13', 'FAILED', 'Chat not found', '2026-09-10 11:00:00')
  `).run();

  const res = await supertest(app)
    .get('/api/notifications/logs')
    .expect(200);

  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length >= 2);
  assert.equal(res.body[0].subscription_name, 'Vercel Pro');
  assert.equal(res.body[1].subscription_name, 'GitHub Copilot');
});
