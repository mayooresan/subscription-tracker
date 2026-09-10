import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCycle, advanceToNextFutureRenewal, normalizeToMonthly, parseDate, formatDate } from '../src/server/utils/rollover.js';

test('addCycle correctly increments weekly, monthly, quarterly, and yearly', () => {
  assert.equal(addCycle('2026-01-01', 'weekly'), '2026-01-08');
  assert.equal(addCycle('2026-01-15', 'monthly'), '2026-02-15');
  assert.equal(addCycle('2026-01-15', 'quarterly'), '2026-04-15');
  assert.equal(addCycle('2026-01-15', 'yearly'), '2027-01-15');
});

test('addCycle handles month-end boundaries without skipping months', () => {
  // Jan 31 + 1 month should result in Feb 28 (or Feb 29 in leap years)
  assert.equal(addCycle('2026-01-31', 'monthly'), '2026-02-28');
  // Leap year check: Jan 31, 2024 + 1 month -> Feb 29, 2024
  assert.equal(addCycle('2024-01-31', 'monthly'), '2024-02-29');
  // March 31 + 1 month should clamp to April 30
  assert.equal(addCycle('2026-03-31', 'monthly'), '2026-04-30');
  // May 31 + quarterly (3 months) should clamp to August 31
  assert.equal(addCycle('2026-05-31', 'quarterly'), '2026-08-31');
  // Aug 31 + quarterly (3 months) should clamp to Nov 30
  assert.equal(addCycle('2026-08-31', 'quarterly'), '2026-11-30');
  // Feb 29 leap year + yearly -> Feb 28 non-leap year
  assert.equal(addCycle('2024-02-29', 'yearly'), '2025-02-28');
});

test('addCycle throws error on unsupported billing cycle', () => {
  assert.throws(() => addCycle('2026-01-01', 'daily'), /Unsupported billing cycle: daily/);
  assert.throws(() => addCycle('2026-01-01', 'biannual'), /Unsupported billing cycle: biannual/);
});

test('advanceToNextFutureRenewal advances past dates to the next upcoming renewal', () => {
  const reference = '2026-09-10';
  // A monthly renewal from 2026-07-15 should advance to 2026-09-15
  assert.equal(advanceToNextFutureRenewal('2026-07-15', 'monthly', reference), '2026-09-15');
  // Multiple cycles in past (weekly)
  assert.equal(advanceToNextFutureRenewal('2026-08-01', 'weekly', '2026-08-20'), '2026-08-22');
  // Already future renewal returns the date unchanged
  assert.equal(advanceToNextFutureRenewal('2026-09-15', 'monthly', reference), '2026-09-15');
  // Renewal on reference date returns the reference date unchanged
  assert.equal(advanceToNextFutureRenewal('2026-09-10', 'monthly', reference), '2026-09-10');
});

test('advanceToNextFutureRenewal defaults referenceDate to current UTC date', () => {
  const today = formatDate(new Date());
  // Date in the future remains unchanged
  const futureDate = '2099-01-01';
  assert.equal(advanceToNextFutureRenewal(futureDate, 'monthly'), futureDate);
  // An old date is advanced to at least today
  const nextDate = advanceToNextFutureRenewal('2020-01-01', 'monthly');
  assert.ok(nextDate >= today);
});

test('normalizeToMonthly calculates normalized monthly costs', () => {
  assert.equal(normalizeToMonthly(120, 'yearly'), 10);
  assert.equal(normalizeToMonthly(30, 'quarterly'), 10);
  assert.equal(normalizeToMonthly(15, 'monthly'), 15);
  assert.equal(Math.round(normalizeToMonthly(10, 'weekly')), 43); // 10 * (52 / 12) ~ 43.33
  // Handles string numeric inputs
  assert.equal(normalizeToMonthly('120', 'yearly'), 10);
  // Handles invalid/null price as 0
  assert.equal(normalizeToMonthly(null, 'monthly'), 0);
  assert.equal(normalizeToMonthly(undefined, 'monthly'), 0);
  // Unknown cycle defaults to numPrice
  assert.equal(normalizeToMonthly(50, 'custom'), 50);
});

test('parseDate and formatDate UTC roundtrip', () => {
  const iso = '2026-02-28';
  const d = parseDate(iso);
  assert.equal(formatDate(d), iso);
  assert.equal(d.getUTCFullYear(), 2026);
  assert.equal(d.getUTCMonth(), 1);
  assert.equal(d.getUTCDate(), 28);
});
