import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/server/config.js';

test('loadConfig returns default values when env is empty', () => {
  const config = loadConfig({});
  assert.equal(config.port, 3000);
  assert.equal(config.dbPath, './data/subscriptions.db');
  assert.equal(config.appPassword, 'admin');
  assert.equal(typeof config.sessionSecret, 'string');
  assert.equal(config.notifyHoursBefore, 24);
});

test('loadConfig overrides defaults with environment variables', () => {
  const config = loadConfig({
    PORT: '4000',
    DB_PATH: './custom.db',
    APP_PASSWORD: 'secretpassword',
    SESSION_SECRET: 'mysecret',
    TELEGRAM_BOT_TOKEN: '1234:token',
    TELEGRAM_CHAT_ID: '987654',
    NOTIFY_HOURS_BEFORE: '48'
  });
  assert.equal(config.port, 4000);
  assert.equal(config.dbPath, './custom.db');
  assert.equal(config.appPassword, 'secretpassword');
  assert.equal(config.sessionSecret, 'mysecret');
  assert.equal(config.telegramBotToken, '1234:token');
  assert.equal(config.telegramChatId, '987654');
  assert.equal(config.notifyHoursBefore, 48);
});
