import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson, api } from '../src/client/src/api.js';

let originalFetch;
let originalWindow;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalWindow = globalThis.window;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
});

test('fetchJson sends Content-Type application/json and parses response json', async () => {
  let calledUrl = '';
  let calledOptions = {};

  globalThis.fetch = async (url, options) => {
    calledUrl = url;
    calledOptions = options;
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    };
  };

  const res = await fetchJson('/test', { headers: { 'X-Custom': '1' } });
  assert.equal(calledUrl, '/test');
  assert.equal(calledOptions.headers['Content-Type'], 'application/json');
  assert.equal(calledOptions.headers['X-Custom'], '1');
  assert.deepEqual(res, { success: true });
});

test('fetchJson throws error from response data or status fallback', async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: 'Invalid input' }),
  });

  await assert.rejects(
    () => fetchJson('/test-error'),
    { message: 'Invalid input' }
  );

  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => { throw new Error('not json'); },
  });

  await assert.rejects(
    () => fetchJson('/test-500'),
    { message: 'HTTP error 500' }
  );
});

test('fetchJson dispatches auth-unauthorized event on 401', async () => {
  let dispatchedEvent = null;
  globalThis.window = {
    dispatchEvent: (ev) => {
      dispatchedEvent = ev;
    },
  };

  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: 'Unauthorized' }),
  });

  await assert.rejects(
    () => fetchJson('/protected'),
    { message: 'Unauthorized' }
  );

  assert.ok(dispatchedEvent);
  assert.equal(dispatchedEvent.type, 'auth-unauthorized');
});

test('fetchJson handles 401 safely when window is undefined (SSR)', async () => {
  delete globalThis.window;

  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: 'Unauthorized' }),
  });

  await assert.rejects(
    () => fetchJson('/protected'),
    { message: 'Unauthorized' }
  );
});

test('api endpoints invoke fetchJson with appropriate parameters', async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    };
  };

  await api.checkAuth();
  await api.login('mypass');
  await api.logout();
  await api.getSubscriptions({ status: 'active' });
  await api.getStats();
  await api.createSubscription({ name: 'Sub 1' });
  await api.updateSubscription(42, { name: 'Sub 42' });
  await api.toggleSubscription(42);
  await api.deleteSubscription(42);
  await api.getSettings();
  await api.updateSettings({ telegram_chat_id: '123' });
  await api.testTelegram({ botToken: 'tok', chatId: '123' });
  await api.getLogs();

  assert.deepEqual(calls, [
    { url: '/api/auth/status', method: 'GET', body: undefined },
    { url: '/api/auth/login', method: 'POST', body: JSON.stringify({ password: 'mypass' }) },
    { url: '/api/auth/logout', method: 'POST', body: undefined },
    { url: '/api/subscriptions?status=active', method: 'GET', body: undefined },
    { url: '/api/subscriptions/stats', method: 'GET', body: undefined },
    { url: '/api/subscriptions', method: 'POST', body: JSON.stringify({ name: 'Sub 1' }) },
    { url: '/api/subscriptions/42', method: 'PUT', body: JSON.stringify({ name: 'Sub 42' }) },
    { url: '/api/subscriptions/42/toggle', method: 'PATCH', body: undefined },
    { url: '/api/subscriptions/42', method: 'DELETE', body: undefined },
    { url: '/api/settings', method: 'GET', body: undefined },
    { url: '/api/settings', method: 'PUT', body: JSON.stringify({ telegram_chat_id: '123' }) },
    { url: '/api/settings/test-telegram', method: 'POST', body: JSON.stringify({ botToken: 'tok', chatId: '123' }) },
    { url: '/api/notifications/logs', method: 'GET', body: undefined },
  ]);
});
