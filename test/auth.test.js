import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import {
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  createAuthMiddleware,
} from '../src/server/auth.js';
import { createAuthRouter } from '../src/server/routes/auth.routes.js';

test('verifyPassword returns true for exact password match', () => {
  assert.equal(verifyPassword('mypassword', 'mypassword'), true);
});

test('verifyPassword returns false for wrong password or empty input', () => {
  assert.equal(verifyPassword('wrong', 'mypassword'), false);
  assert.equal(verifyPassword('', 'mypassword'), false);
  assert.equal(verifyPassword(null, 'mypassword'), false);
  assert.equal(verifyPassword(undefined, 'mypassword'), false);
  assert.equal(verifyPassword(123, 'mypassword'), false);
});

test('createSessionToken creates token verifiable by verifySessionToken', () => {
  const secret = 'test-secret-key';
  const token = createSessionToken(secret);
  assert.equal(verifySessionToken(token, secret), true);
  assert.equal(verifySessionToken('tampered.token', secret), false);
  assert.equal(verifySessionToken(token, 'different-secret'), false);
  assert.equal(verifySessionToken('', secret), false);
  assert.equal(verifySessionToken('invalid', secret), false);
  assert.equal(verifySessionToken(null, secret), false);
});

test('verifySessionToken returns false for expired tokens', () => {
  const secret = 'test-secret-key';
  const expiredIat = Date.now() - (31 * 24 * 60 * 60 * 1000);
  const payload = JSON.stringify({ iat: expiredIat });
  const base64Payload = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(base64Payload).digest('base64url');
  const expiredToken = `${base64Payload}.${signature}`;

  assert.equal(verifySessionToken(expiredToken, secret), false);

  const freshToken = createSessionToken(secret);
  assert.equal(verifySessionToken(freshToken, secret, 1000), true);
  assert.equal(verifySessionToken(freshToken, secret, -1), false);
});

test('createAuthMiddleware protects routes requiring valid session', async () => {
  const secret = 'test-secret-key';
  const app = express();
  app.use(cookieParser());
  app.use(createAuthMiddleware(secret));
  app.get('/protected', (req, res) => res.json({ ok: true }));

  // Missing cookie
  const unauthRes = await request(app).get('/protected');
  assert.equal(unauthRes.status, 401);
  assert.deepEqual(unauthRes.body, { error: 'Unauthorized: invalid or missing session' });

  // Invalid cookie
  const invalidRes = await request(app)
    .get('/protected')
    .set('Cookie', ['sub_session=invalid.token']);
  assert.equal(invalidRes.status, 401);

  // Valid cookie
  const validToken = createSessionToken(secret);
  const authRes = await request(app)
    .get('/protected')
    .set('Cookie', [`sub_session=${validToken}`]);
  assert.equal(authRes.status, 200);
  assert.deepEqual(authRes.body, { ok: true });
});

test('auth router handles /login, /logout, and /status', async () => {
  const config = {
    appPassword: 'secretpassword',
    sessionSecret: 'test-session-secret',
  };

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', createAuthRouter(config));

  // 1. Check status without cookie
  const initialStatus = await request(app).get('/api/auth/status');
  assert.equal(initialStatus.status, 200);
  assert.deepEqual(initialStatus.body, { authenticated: false });

  // 2. Failed login
  const failLogin = await request(app)
    .post('/api/auth/login')
    .send({ password: 'wrongpassword' });
  assert.equal(failLogin.status, 401);
  assert.equal(failLogin.body.success, false);
  assert.equal(failLogin.body.error, 'Incorrect password');

  // 3. Successful login
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ password: 'secretpassword' });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.success, true);
  const cookies = loginRes.headers['set-cookie'];
  assert.ok(cookies && cookies.length > 0);
  const sessionCookie = cookies[0];
  assert.match(sessionCookie, /sub_session=/);
  assert.match(sessionCookie, /HttpOnly/i);

  // Extract session token from cookie
  const cookieValue = sessionCookie.split(';')[0];

  // 4. Status with cookie
  const authStatus = await request(app)
    .get('/api/auth/status')
    .set('Cookie', [cookieValue]);
  assert.equal(authStatus.status, 200);
  assert.deepEqual(authStatus.body, { authenticated: true });

  // 5. Logout
  const logoutRes = await request(app)
    .post('/api/auth/logout')
    .set('Cookie', [cookieValue]);
  assert.equal(logoutRes.status, 200);
  assert.equal(logoutRes.body.success, true);
  const logoutCookies = logoutRes.headers['set-cookie'];
  assert.ok(logoutCookies && logoutCookies.length > 0);
  // Cleared cookie has expired or empty
  assert.match(logoutCookies[0], /sub_session=;/);
});
