import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import supertest from 'supertest';
import fs from 'node:fs';
import { initDb, closeDb } from '../src/server/db.js';
import { createSubsRouter } from '../src/server/routes/subs.routes.js';

const TEST_DB = './data/test-subs-api.db';
let app;

before(() => {
  if (fs.existsSync(TEST_DB)) {
    fs.rmSync(TEST_DB, { force: true });
  }
  initDb(TEST_DB);
  app = express();
  app.use(express.json());
  app.use('/api/subscriptions', createSubsRouter());
});

after(() => {
  closeDb();
  if (fs.existsSync(TEST_DB)) {
    fs.rmSync(TEST_DB, { force: true });
  }
  const walFile = `${TEST_DB}-wal`;
  const shmFile = `${TEST_DB}-shm`;
  if (fs.existsSync(walFile)) fs.rmSync(walFile, { force: true });
  if (fs.existsSync(shmFile)) fs.rmSync(shmFile, { force: true });
});

test('POST /api/subscriptions creates a new subscription and GET retrieves it', async () => {
  const newSub = {
    name: 'Netflix',
    price: 15.99,
    currency: 'USD',
    billing_cycle: 'monthly',
    next_renewal_date: '2026-10-01',
    category: 'Entertainment'
  };

  const postRes = await supertest(app)
    .post('/api/subscriptions')
    .send(newSub)
    .expect(201);

  assert.ok(postRes.body.id);
  assert.equal(postRes.body.name, 'Netflix');
  assert.equal(postRes.body.price, 15.99);
  assert.equal(postRes.body.currency, 'USD');
  assert.equal(postRes.body.billing_cycle, 'monthly');
  assert.equal(postRes.body.next_renewal_date, '2026-10-01');
  assert.equal(postRes.body.category, 'Entertainment');
  assert.equal(postRes.body.is_active, 1);

  const getRes = await supertest(app)
    .get('/api/subscriptions')
    .expect(200);

  assert.equal(getRes.body.length, 1);
  assert.equal(getRes.body[0].name, 'Netflix');
});

test('GET /api/subscriptions/stats calculates normalized burn rate', async () => {
  const statsRes = await supertest(app)
    .get('/api/subscriptions/stats')
    .expect(200);

  assert.equal(statsRes.body.activeCount, 1);
  assert.equal(Math.round(statsRes.body.monthlySpend), 16);
  assert.equal(Math.round(statsRes.body.annualSpend), 192);
});

test('PATCH /api/subscriptions/:id/toggle changes active status', async () => {
  const toggleRes = await supertest(app)
    .patch('/api/subscriptions/1/toggle')
    .expect(200);

  assert.equal(toggleRes.body.is_active, 0);

  // Toggle back to active
  const toggleBackRes = await supertest(app)
    .patch('/api/subscriptions/1/toggle')
    .expect(200);

  assert.equal(toggleBackRes.body.is_active, 1);
});

test('POST /api/subscriptions validates input fields', async () => {
  // Missing / empty name
  await supertest(app)
    .post('/api/subscriptions')
    .send({ price: 10, billing_cycle: 'monthly', next_renewal_date: '2026-10-01' })
    .expect(400);

  await supertest(app)
    .post('/api/subscriptions')
    .send({ name: '   ', price: 10, billing_cycle: 'monthly', next_renewal_date: '2026-10-01' })
    .expect(400);

  // Invalid price
  await supertest(app)
    .post('/api/subscriptions')
    .send({ name: 'Valid Name', price: -5, billing_cycle: 'monthly', next_renewal_date: '2026-10-01' })
    .expect(400);

  await supertest(app)
    .post('/api/subscriptions')
    .send({ name: 'Valid Name', price: 'ten', billing_cycle: 'monthly', next_renewal_date: '2026-10-01' })
    .expect(400);

  // Invalid billing cycle
  await supertest(app)
    .post('/api/subscriptions')
    .send({ name: 'Valid Name', price: 10, billing_cycle: 'daily', next_renewal_date: '2026-10-01' })
    .expect(400);

  // Invalid renewal date format
  await supertest(app)
    .post('/api/subscriptions')
    .send({ name: 'Valid Name', price: 10, billing_cycle: 'monthly', next_renewal_date: '10/01/2026' })
    .expect(400);
});

test('PUT /api/subscriptions/:id updates an existing subscription', async () => {
  const updateRes = await supertest(app)
    .put('/api/subscriptions/1')
    .send({
      name: 'Netflix Premium',
      price: 22.99,
      notes: 'Family 4K plan'
    })
    .expect(200);

  assert.equal(updateRes.body.name, 'Netflix Premium');
  assert.equal(updateRes.body.price, 22.99);
  assert.equal(updateRes.body.notes, 'Family 4K plan');
  // Unchanged fields preserved
  assert.equal(updateRes.body.billing_cycle, 'monthly');
  assert.equal(updateRes.body.category, 'Entertainment');
});

test('PUT, PATCH, DELETE handle 404 for non-existent subscriptions', async () => {
  await supertest(app)
    .put('/api/subscriptions/999')
    .send({ name: 'Nonexistent' })
    .expect(404);

  await supertest(app)
    .patch('/api/subscriptions/999/toggle')
    .expect(404);

  await supertest(app)
    .delete('/api/subscriptions/999')
    .expect(404);
});

test('GET /api/subscriptions supports filtering, searching, and sorting', async () => {
  // Add more subscriptions for testing filters and sorting
  await supertest(app)
    .post('/api/subscriptions')
    .send({
      name: 'Spotify',
      price: 10.99,
      currency: 'USD',
      billing_cycle: 'monthly',
      next_renewal_date: '2026-09-15',
      category: 'Entertainment',
      notes: 'Music streaming'
    })
    .expect(201);

  await supertest(app)
    .post('/api/subscriptions')
    .send({
      name: 'GitHub Copilot',
      price: 100.00,
      currency: 'USD',
      billing_cycle: 'yearly',
      next_renewal_date: '2026-12-01',
      category: 'Work',
      notes: 'AI assistant'
    })
    .expect(201);

  // Filter by category
  const workRes = await supertest(app)
    .get('/api/subscriptions?category=Work')
    .expect(200);
  assert.equal(workRes.body.length, 1);
  assert.equal(workRes.body[0].name, 'GitHub Copilot');

  // Search by keyword
  const searchRes = await supertest(app)
    .get('/api/subscriptions?search=streaming')
    .expect(200);
  assert.equal(searchRes.body.length, 1);
  assert.equal(searchRes.body[0].name, 'Spotify');

  // Sort by price descending
  const priceDescRes = await supertest(app)
    .get('/api/subscriptions?sort=price_desc')
    .expect(200);
  assert.equal(priceDescRes.body[0].name, 'GitHub Copilot');
  assert.equal(priceDescRes.body[1].name, 'Netflix Premium');
  assert.equal(priceDescRes.body[2].name, 'Spotify');

  // Sort by price ascending
  const priceAscRes = await supertest(app)
    .get('/api/subscriptions?sort=price_asc')
    .expect(200);
  assert.equal(priceAscRes.body[0].name, 'Spotify');

  // Sort by name
  const nameSortRes = await supertest(app)
    .get('/api/subscriptions?sort=name')
    .expect(200);
  assert.equal(nameSortRes.body[0].name, 'GitHub Copilot');
  assert.equal(nameSortRes.body[1].name, 'Netflix Premium');
  assert.equal(nameSortRes.body[2].name, 'Spotify');

  // Filter by status (paused vs active)
  await supertest(app).patch('/api/subscriptions/1/toggle').expect(200); // pause Netflix

  const activeRes = await supertest(app)
    .get('/api/subscriptions?status=active')
    .expect(200);
  assert.equal(activeRes.body.length, 2);

  const pausedRes = await supertest(app)
    .get('/api/subscriptions?status=paused')
    .expect(200);
  assert.equal(pausedRes.body.length, 1);
  assert.equal(pausedRes.body[0].name, 'Netflix Premium');

  // Toggle back to active
  await supertest(app).patch('/api/subscriptions/1/toggle').expect(200);
});

test('GET /api/subscriptions/stats counts upcoming renewals in 7 days', async () => {
  const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Update Spotify's renewal date to in3Days to guarantee it falls in the 7-day window
  await supertest(app)
    .put('/api/subscriptions/2')
    .send({ next_renewal_date: in3Days })
    .expect(200);

  const statsRes = await supertest(app)
    .get('/api/subscriptions/stats')
    .expect(200);

  assert.equal(statsRes.body.totalCount, 3);
  assert.equal(statsRes.body.activeCount, 3);
  assert.ok(statsRes.body.upcomingIn7Days >= 1);
});

test('DELETE /api/subscriptions/:id deletes the subscription', async () => {
  const deleteRes = await supertest(app)
    .delete('/api/subscriptions/3')
    .expect(200);

  assert.equal(deleteRes.body.success, true);

  const getRes = await supertest(app)
    .get('/api/subscriptions')
    .expect(200);

  assert.equal(getRes.body.length, 2);
  assert.ok(!getRes.body.some(sub => sub.id === 3));
});
