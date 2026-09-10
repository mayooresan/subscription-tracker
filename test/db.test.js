import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initDb, getDb, closeDb } from '../src/server/db.js';

const TEST_DB = './data/test-subscriptions.db';

afterEach(() => {
  closeDb();
  if (fs.existsSync(TEST_DB)) {
    fs.rmSync(TEST_DB, { force: true });
  }
  if (fs.existsSync(`${TEST_DB}-wal`)) {
    fs.rmSync(`${TEST_DB}-wal`, { force: true });
  }
  if (fs.existsSync(`${TEST_DB}-shm`)) {
    fs.rmSync(`${TEST_DB}-shm`, { force: true });
  }
});

test('initDb initializes sqlite database and creates tables', () => {
  const db = initDb(TEST_DB);
  assert.ok(db, 'Database instance should be created');

  // Verify tables exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  assert.ok(tables.includes('settings'), 'settings table should exist');
  assert.ok(tables.includes('subscriptions'), 'subscriptions table should exist');
  assert.ok(tables.includes('notification_logs'), 'notification_logs table should exist');

  // Verify settings row with id=1 is initialized
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  assert.ok(settings, 'Initial settings row should exist');
  assert.equal(settings.notify_hours_before, 24);
});

test('getDb returns instance after initDb and throws before initDb', () => {
  assert.throws(() => getDb(), /Database not initialized/);
  const db = initDb(TEST_DB);
  assert.equal(getDb(), db);
});
