import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server/index.js';
import { closeDb } from '../src/server/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DB = './data/test-server.db';
let app;

before(() => {
  const result = createServer({
    port: 0,
    dbPath: TEST_DB,
    appPassword: 'secretpassword',
    sessionSecret: 'test-secret',
    enableScheduler: false
  });
  app = result.app;
});

after(() => {
  closeDb();
  if (fs.existsSync(TEST_DB)) {
    fs.rmSync(TEST_DB, { force: true });
  }
});

test('Unauthenticated request to /api/subscriptions returns 401', async () => {
  await supertest(app)
    .get('/api/subscriptions')
    .expect(401);
});

test('Unauthenticated request to /api/settings returns 401', async () => {
  await supertest(app)
    .get('/api/settings')
    .expect(401);
});

test('Login with password and access protected route with cookie succeeds', async () => {
  const loginRes = await supertest(app)
    .post('/api/auth/login')
    .send({ password: 'secretpassword' })
    .expect(200);

  const cookie = loginRes.headers['set-cookie'];
  assert.ok(cookie);

  const subsRes = await supertest(app)
    .get('/api/subscriptions')
    .set('Cookie', cookie)
    .expect(200);

  assert.ok(Array.isArray(subsRes.body));

  const settingsRes = await supertest(app)
    .get('/api/settings')
    .set('Cookie', cookie)
    .expect(200);

  assert.equal(typeof settingsRes.body, 'object');
  assert.ok('currency_symbol' in settingsRes.body);
});

test('createServer starts scheduler when enableScheduler is true and returns task', async () => {
  const customDb = './data/test-scheduler-server.db';
  const { schedulerTask } = createServer({
    port: 0,
    dbPath: customDb,
    appPassword: 'pwd',
    sessionSecret: 'sec',
    enableScheduler: true,
    mockSender: async () => ({ ok: true })
  });

  assert.ok(schedulerTask);
  assert.equal(typeof schedulerTask.stop, 'function');
  schedulerTask.stop();

  closeDb();
  if (fs.existsSync(customDb)) {
    fs.rmSync(customDb, { force: true });
  }
});

test('SPA fallback routes serve index.html when dist exists without intercepting /api routes', async () => {
  const distDir = path.resolve(__dirname, '../dist');
  const createdDist = !fs.existsSync(distDir);
  if (createdDist) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  const testHtmlFile = path.join(distDir, 'index.html');
  const existedHtml = fs.existsSync(testHtmlFile);
  if (!existedHtml) {
    fs.writeFileSync(testHtmlFile, '<!DOCTYPE html><html><body>Test App</body></html>');
  }

  const customDb = './data/test-spa-server.db';
  const { app: spaApp } = createServer({
    port: 0,
    dbPath: customDb,
    appPassword: 'pwd',
    sessionSecret: 'sec',
    enableScheduler: false
  });

  try {
    const spaRes = await supertest(spaApp)
      .get('/dashboard')
      .expect(200);
    assert.match(spaRes.text, /(Test App|SubTrack)/);

    // /api routes should not be intercepted by SPA fallback
    await supertest(spaApp)
      .get('/api/nonexistent-route')
      .expect(401); // 401 because /api routes require auth or return 404
  } finally {
    closeDb();
    if (fs.existsSync(customDb)) {
      fs.rmSync(customDb, { force: true });
    }
    if (!existedHtml && fs.existsSync(testHtmlFile)) {
      fs.rmSync(testHtmlFile, { force: true });
    }
    if (createdDist && fs.existsSync(distDir)) {
      fs.rmdirSync(distDir);
    }
  }
});
