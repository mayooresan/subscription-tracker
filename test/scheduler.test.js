import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initDb, closeDb, getDb } from '../src/server/db.js';
import {
  calculateTomorrow,
  autoAdvancePassedSubscriptions,
  advancePassedSubscriptions,
  checkUpcomingRenewals,
  startScheduler
} from '../src/server/services/scheduler.service.js';

const TEST_DB = './data/test-scheduler.db';

function cleanupDbFiles() {
  if (fs.existsSync(TEST_DB)) {
    fs.rmSync(TEST_DB, { force: true });
  }
  if (fs.existsSync(`${TEST_DB}-wal`)) {
    fs.rmSync(`${TEST_DB}-wal`, { force: true });
  }
  if (fs.existsSync(`${TEST_DB}-shm`)) {
    fs.rmSync(`${TEST_DB}-shm`, { force: true });
  }
}

before(() => {
  cleanupDbFiles();
  const db = initDb(TEST_DB);
  // Insert active subscription renewing tomorrow (24 hours away)
  db.prepare(`
    INSERT INTO subscriptions (name, price, billing_cycle, next_renewal_date, is_active)
    VALUES ('GitHub Copilot', 10.0, 'monthly', '2026-09-11', 1)
  `).run();

  // Insert subscription renewing in 3 days (not within 24h)
  db.prepare(`
    INSERT INTO subscriptions (name, price, billing_cycle, next_renewal_date, is_active)
    VALUES ('AWS Cloud', 50.0, 'monthly', '2026-09-14', 1)
  `).run();

  // Insert inactive subscription renewing tomorrow
  db.prepare(`
    INSERT INTO subscriptions (name, price, billing_cycle, next_renewal_date, is_active)
    VALUES ('Cancelled Service', 20.0, 'monthly', '2026-09-11', 0)
  `).run();
});

after(() => {
  closeDb();
  cleanupDbFiles();
});

test('checkUpcomingRenewals notifies only subscriptions renewing within 24h', async () => {
  const fakeSender = async () => ({ ok: true });
  const result = await checkUpcomingRenewals({
    referenceDate: '2026-09-10',
    mockSender: fakeSender
  });

  assert.equal(result.notifiedCount, 1);

  // Verify last_notified_renewal_date was marked
  const db = getDb();
  const sub = db.prepare("SELECT * FROM subscriptions WHERE name = 'GitHub Copilot'").get();
  assert.equal(sub.last_notified_renewal_date, '2026-09-11');

  // Verify success log in notification_logs
  const log = db.prepare("SELECT * FROM notification_logs WHERE subscription_name = 'GitHub Copilot'").get();
  assert.ok(log, 'Log entry should exist');
  assert.equal(log.status, 'SUCCESS');
  assert.equal(log.renewal_date, '2026-09-11');
});

test('checkUpcomingRenewals is idempotent and will not re-notify the same cycle', async () => {
  const fakeSender = async () => ({ ok: true });
  const result = await checkUpcomingRenewals({
    referenceDate: '2026-09-10',
    mockSender: fakeSender
  });

  // Second run on same day should notify 0 subscriptions
  assert.equal(result.notifiedCount, 0);
});

test('calculateTomorrow correctly calculates tomorrow across days, months, and years', () => {
  assert.equal(calculateTomorrow('2026-09-10'), '2026-09-11');
  assert.equal(calculateTomorrow('2026-01-31'), '2026-02-01');
  assert.equal(calculateTomorrow('2026-12-31'), '2027-01-01');
  assert.equal(calculateTomorrow('2024-02-28'), '2024-02-29'); // leap year
});

test('autoAdvancePassedSubscriptions advances past dates and resets last_notified_renewal_date', () => {
  const db = getDb();
  // Insert past subscription that was already notified
  const info = db.prepare(`
    INSERT INTO subscriptions (name, price, billing_cycle, next_renewal_date, is_active, last_notified_renewal_date)
    VALUES ('Past Service', 15.0, 'monthly', '2026-08-01', 1, '2026-08-01')
  `).run();
  const id = info.lastInsertRowid;

  // Run autoAdvance with reference date 2026-09-10
  autoAdvancePassedSubscriptions('2026-09-10');

  const updated = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
  assert.equal(updated.next_renewal_date, '2026-10-01');
  assert.equal(updated.last_notified_renewal_date, null);

  // Also verify alias advancePassedSubscriptions works
  assert.equal(typeof advancePassedSubscriptions, 'function');
});

test('checkUpcomingRenewals handles sender failure, records error log, and keeps subscription unnotified', async () => {
  const db = getDb();
  // Insert a subscription renewing tomorrow
  const info = db.prepare(`
    INSERT INTO subscriptions (name, price, billing_cycle, next_renewal_date, is_active)
    VALUES ('Failing Service', 25.0, 'monthly', '2026-09-11', 1)
  `).run();
  const id = info.lastInsertRowid;

  const failingSender = async () => ({ ok: false, error: 'Network timeout' });
  const result = await checkUpcomingRenewals({
    referenceDate: '2026-09-10',
    mockSender: failingSender
  });

  assert.equal(result.notifiedCount, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Failed to notify Failing Service: Network timeout/);

  // Check subscription was not marked as notified
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
  assert.equal(sub.last_notified_renewal_date, null);

  // Check failed log in notification_logs
  const log = db.prepare("SELECT * FROM notification_logs WHERE subscription_name = 'Failing Service' ORDER BY id DESC").get();
  assert.ok(log);
  assert.equal(log.status, 'FAILED');
  assert.equal(log.error_message, 'Network timeout');
});

test('checkUpcomingRenewals supports dryRun and nowIso options', async () => {
  const db = getDb();
  // Insert subscription renewing 2026-10-15
  const info = db.prepare(`
    INSERT INTO subscriptions (name, price, billing_cycle, next_renewal_date, is_active)
    VALUES ('DryRun Service', 30.0, 'monthly', '2026-10-15', 1)
  `).run();
  const id = info.lastInsertRowid;

  let called = false;
  const fakeSender = async () => {
    called = true;
    return { ok: true };
  };

  const result = await checkUpcomingRenewals({
    nowIso: '2026-10-14T10:00:00.000Z',
    dryRun: true,
    mockSender: fakeSender
  });

  assert.equal(called, false);
  assert.equal(result.notifiedCount, 1);

  // Verify subscription is still unnotified
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
  assert.equal(sub.last_notified_renewal_date, null);
});

test('startScheduler initializes cron task and returns it', () => {
  const task = startScheduler({
    telegramBotToken: 'test-token',
    telegramChatId: '123456'
  });

  assert.ok(task, 'Task instance should be returned');
  assert.equal(typeof task.stop, 'function', 'Task should have stop method');
  task.stop();
});
