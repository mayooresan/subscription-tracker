# Subscription Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-user, self-hosted subscription tracking application in Node.js and SQLite with single-password authentication, an intuitive React + Tailwind dashboard, and automated Telegram Bot notifications dispatched exactly 24 hours before renewal.

**Architecture:** A unified single-process Node.js app using Express and `better-sqlite3`. Express serves REST APIs and statically hosts the bundled React frontend. A built-in `node-cron` worker runs hourly to detect renewals within the 24-hour window, sends Telegram Markdown messages, and records notification logs with idempotency safeguards.

**Tech Stack:** Node.js (v18+), Express, `better-sqlite3`, `node-cron`, `cookie-parser`, React, Vite, Tailwind CSS, Lucide React (icons), `node:test` (Node test runner).

**Spec:** [`docs/superpowers/specs/2026-09-10-subscription-tracker-design.md`](file:///Users/test/Documents/devexp/subscription/docs/superpowers/specs/2026-09-10-subscription-tracker-design.md)

## Global Constraints

- Platform: macOS / Linux / Node.js 18+
- Port: Default `3000`, configurable via `PORT`
- Database: Embedded SQLite via `better-sqlite3` located at `data/subscriptions.db`
- Authentication: Single password checked from `APP_PASSWORD` with timing-safe comparison; signed HTTP-only session cookie
- Notifications: Telegram Bot API (`https://api.telegram.org/bot<token>/sendMessage`)
- Idempotency: `last_notified_renewal_date` tracks notified cycles to prevent duplicate notifications

---

### Task 1: Project Scaffolding & Configuration

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/server/config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Consumes: `process.env`
- Produces: `config` object in `src/server/config.js`:
  ```javascript
  {
    port: number,
    dbPath: string,
    appPassword: string,
    sessionSecret: string,
    telegramBotToken: string,
    telegramChatId: string,
    notifyHoursBefore: number
  }
  ```

- [ ] **Step 1: Write the failing test for configuration**

Create `test/config.test.js`:
```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/config.test.js`  
Expected: FAIL (module `../src/server/config.js` not found).

- [ ] **Step 3: Create package.json, .gitignore, .env.example, and implement config.js**

Create `package.json`:
```json
{
  "name": "subscription-tracker",
  "version": "1.0.0",
  "type": "module",
  "description": "Subscription tracking app with 24-hour Telegram alerts",
  "main": "src/server/index.js",
  "scripts": {
    "start": "node src/server/index.js",
    "dev:server": "node --watch src/server/index.js",
    "dev:client": "vite --config src/client/vite.config.js",
    "build": "vite build --config src/client/vite.config.js",
    "test": "node --test test/*.test.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.8.1",
    "cookie-parser": "^1.4.7",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.9",
    "@vitejs/plugin-react": "^4.3.4",
    "lucide-react": "^0.475.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "supertest": "^7.0.0",
    "tailwindcss": "^4.0.9",
    "vite": "^6.2.0"
  }
}
```

Create `.gitignore`:
```text
node_modules/
dist/
data/
*.db
*.db-journal
*.db-wal
*.db-shm
.env
.DS_Store
```

Create `.env.example`:
```env
PORT=3000
DB_PATH=./data/subscriptions.db
APP_PASSWORD=admin
SESSION_SECRET=change-this-to-a-random-secret
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
NOTIFY_HOURS_BEFORE=24
```

Create `src/server/config.js`:
```javascript
import crypto from 'node:crypto';

export function loadConfig(env = process.env) {
  return {
    port: parseInt(env.PORT || '3000', 10),
    dbPath: env.DB_PATH || './data/subscriptions.db',
    appPassword: env.APP_PASSWORD || 'admin',
    sessionSecret: env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: env.TELEGRAM_CHAT_ID || '',
    notifyHoursBefore: parseInt(env.NOTIFY_HOURS_BEFORE || '24', 10),
  };
}

export const config = loadConfig(process.env);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/config.test.js`  
Expected: PASS (2 tests pass).

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore .env.example src/server/config.js test/config.test.js
git commit -m "feat: scaffold project and implement environment configuration"
```

---

### Task 2: SQLite Database Connection & Schema Migration

**Files:**
- Create: `src/server/db.js`
- Test: `test/db.test.js`

**Interfaces:**
- Consumes: `dbPath` from `config`
- Produces: `initDb(path)`, `getDb()` returning initialized `better-sqlite3` instance with tables: `settings`, `subscriptions`, `notification_logs`.

- [ ] **Step 1: Write the failing test for database initialization**

Create `test/db.test.js`:
```javascript
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initDb, closeDb } from '../src/server/db.js';

const TEST_DB = './data/test-subscriptions.db';

afterEach(() => {
  closeDb();
  if (fs.existsSync(TEST_DB)) {
    fs.rmSync(TEST_DB, { force: true });
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/db.test.js`  
Expected: FAIL (`../src/server/db.js` not found).

- [ ] **Step 3: Implement db.js with better-sqlite3 and schema migrations**

Create `src/server/db.js`:
```javascript
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

let dbInstance = null;

export function initDb(dbPath = './data/subscriptions.db') {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  // Schema creation
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      telegram_bot_token TEXT,
      telegram_chat_id TEXT,
      notify_hours_before INTEGER DEFAULT 24,
      currency_symbol TEXT DEFAULT '$',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('weekly', 'monthly', 'quarterly', 'yearly')),
      next_renewal_date TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      is_active INTEGER DEFAULT 1,
      notes TEXT,
      url TEXT,
      last_notified_renewal_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
      subscription_name TEXT NOT NULL,
      renewal_date TEXT NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL,
      error_message TEXT
    );

    INSERT OR IGNORE INTO settings (id, notify_hours_before, currency_symbol)
    VALUES (1, 24, '$');
  `);

  return dbInstance;
}

export function getDb() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return dbInstance;
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/db.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db.js test/db.test.js
git commit -m "feat: implement SQLite database initialization and schema migrations"
```

---

### Task 3: Single-Password Authentication & Session Middleware

**Files:**
- Create: `src/server/auth.js`
- Create: `src/server/routes/auth.routes.js`
- Test: `test/auth.test.js`

**Interfaces:**
- Consumes: `appPassword`, `sessionSecret` from config
- Produces:
  - `verifyPassword(inputPassword, expectedPassword)` -> `boolean`
  - `createSessionToken(secret)` -> `string`
  - `verifySessionToken(token, secret)` -> `boolean`
  - `requireAuth(secret)` -> Express middleware
  - Express router `authRouter` for `/api/auth/login`, `/api/auth/logout`, `/api/auth/status`

- [ ] **Step 1: Write failing tests for authentication logic**

Create `test/auth.test.js`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyPassword, createSessionToken, verifySessionToken } from '../src/server/auth.js';

test('verifyPassword returns true for exact password match', () => {
  assert.equal(verifyPassword('mypassword', 'mypassword'), true);
});

test('verifyPassword returns false for wrong password or empty input', () => {
  assert.equal(verifyPassword('wrong', 'mypassword'), false);
  assert.equal(verifyPassword('', 'mypassword'), false);
});

test('createSessionToken creates token verifiable by verifySessionToken', () => {
  const secret = 'test-secret-key';
  const token = createSessionToken(secret);
  assert.equal(verifySessionToken(token, secret), true);
  assert.equal(verifySessionToken('tampered.token', secret), false);
  assert.equal(verifySessionToken(token, 'different-secret'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/auth.test.js`  
Expected: FAIL (`../src/server/auth.js` not found).

- [ ] **Step 3: Implement auth.js and auth.routes.js**

Create `src/server/auth.js`:
```javascript
import crypto from 'node:crypto';

export function verifyPassword(inputPassword, expectedPassword) {
  if (typeof inputPassword !== 'string' || typeof expectedPassword !== 'string') {
    return false;
  }
  const inputHash = crypto.createHash('sha256').update(inputPassword).digest();
  const expectedHash = crypto.createHash('sha256').update(expectedPassword).digest();
  return crypto.timingSafeEqual(inputHash, expectedHash);
}

export function createSessionToken(secret) {
  const payload = JSON.stringify({ iat: Date.now() });
  const base64Payload = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(base64Payload).digest('base64url');
  return `${base64Payload}.${signature}`;
}

export function verifySessionToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) {
    return false;
  }
  const [base64Payload, signature] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', secret).update(base64Payload).digest('base64url');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
}

export function createAuthMiddleware(secret) {
  return (req, res, next) => {
    const token = req.cookies?.sub_session;
    if (!token || !verifySessionToken(token, secret)) {
      return res.status(401).json({ error: 'Unauthorized: invalid or missing session' });
    }
    next();
  };
}
```

Create `src/server/routes/auth.routes.js`:
```javascript
import { Router } from 'express';
import { verifyPassword, createSessionToken, verifySessionToken } from '../auth.js';

export function createAuthRouter(config) {
  const router = Router();

  router.post('/login', (req, res) => {
    const { password } = req.body || {};
    if (!verifyPassword(password, config.appPassword)) {
      return res.status(401).json({ success: false, error: 'Incorrect password' });
    }

    const token = createSessionToken(config.sessionSecret);
    res.cookie('sub_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      secure: process.env.NODE_ENV === 'production',
    });

    return res.json({ success: true, message: 'Authenticated successfully' });
  });

  router.post('/logout', (req, res) => {
    res.clearCookie('sub_session');
    return res.json({ success: true, message: 'Logged out' });
  });

  router.get('/status', (req, res) => {
    const token = req.cookies?.sub_session;
    const authenticated = Boolean(token && verifySessionToken(token, config.sessionSecret));
    return res.json({ authenticated });
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/auth.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/auth.js src/server/routes/auth.routes.js test/auth.test.js
git commit -m "feat: implement single-password authentication and session verification"
```

---

### Task 4: Subscription Recurrence & Date Rollover Logic

**Files:**
- Create: `src/server/utils/rollover.js`
- Test: `test/rollover.test.js`

**Interfaces:**
- Consumes: `next_renewal_date: string` (YYYY-MM-DD), `billing_cycle: string` ('weekly'|'monthly'|'quarterly'|'yearly')
- Produces:
  - `addCycle(isoDateString, cycle)` -> `string` (YYYY-MM-DD)
  - `advanceToNextFutureRenewal(isoDateString, cycle, referenceDate)` -> `string` (YYYY-MM-DD)
  - `normalizeToMonthly(price, cycle)` -> `number`

- [ ] **Step 1: Write failing tests for date arithmetic and cycle calculations**

Create `test/rollover.test.js`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCycle, advanceToNextFutureRenewal, normalizeToMonthly } from '../src/server/utils/rollover.js';

test('addCycle correctly increments weekly, monthly, quarterly, and yearly', () => {
  assert.equal(addCycle('2026-01-01', 'weekly'), '2026-01-08');
  assert.equal(addCycle('2026-01-15', 'monthly'), '2026-02-15');
  assert.equal(addCycle('2026-01-15', 'quarterly'), '2026-04-15');
  assert.equal(addCycle('2026-01-15', 'yearly'), '2027-01-15');
});

test('addCycle handles month-end boundaries without skipping months', () => {
  // Jan 31 + 1 month should result in Feb 28 (or Feb 29 in leap years)
  assert.equal(addCycle('2026-01-31', 'monthly'), '2026-02-28');
  // March 31 + 1 month should clamp to April 30
  assert.equal(addCycle('2026-03-31', 'monthly'), '2026-04-30');
});

test('advanceToNextFutureRenewal advances past dates to the next upcoming renewal', () => {
  const reference = '2026-09-10';
  // A monthly renewal from 2026-07-15 should advance to 2026-09-15
  assert.equal(advanceToNextFutureRenewal('2026-07-15', 'monthly', reference), '2026-09-15');
});

test('normalizeToMonthly calculates normalized monthly costs', () => {
  assert.equal(normalizeToMonthly(120, 'yearly'), 10);
  assert.equal(normalizeToMonthly(30, 'quarterly'), 10);
  assert.equal(normalizeToMonthly(15, 'monthly'), 15);
  assert.equal(Math.round(normalizeToMonthly(10, 'weekly')), 43); // 10 * (52 / 12) ~ 43.33
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/rollover.test.js`  
Expected: FAIL (`../src/server/utils/rollover.js` not found).

- [ ] **Step 3: Implement rollover.js**

Create `src/server/utils/rollover.js`:
```javascript
export function parseDate(isoString) {
  const [year, month, day] = isoString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addCycle(isoDateString, cycle) {
  const date = parseDate(isoDateString);
  const originalDay = date.getUTCDate();

  switch (cycle) {
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7);
      return formatDate(date);

    case 'monthly':
      return addMonthsClamped(date, 1, originalDay);

    case 'quarterly':
      return addMonthsClamped(date, 3, originalDay);

    case 'yearly':
      return addMonthsClamped(date, 12, originalDay);

    default:
      throw new Error(`Unsupported billing cycle: ${cycle}`);
  }
}

function addMonthsClamped(date, monthsToAdd, targetDay) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  
  // Create first day of target month
  const target = new Date(Date.UTC(year, month + monthsToAdd, 1));
  
  // Find last day of target month
  const lastDayOfTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  
  // Clamp day to max available days in that month
  target.setUTCDate(Math.min(targetDay, lastDayOfTargetMonth));
  return formatDate(target);
}

export function advanceToNextFutureRenewal(isoDateString, cycle, referenceDate = formatDate(new Date())) {
  let current = isoDateString;
  while (current < referenceDate) {
    current = addCycle(current, cycle);
  }
  return current;
}

export function normalizeToMonthly(price, cycle) {
  const numPrice = Number(price) || 0;
  switch (cycle) {
    case 'weekly':
      return (numPrice * 52) / 12;
    case 'monthly':
      return numPrice;
    case 'quarterly':
      return numPrice / 3;
    case 'yearly':
      return numPrice / 12;
    default:
      return numPrice;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/rollover.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/utils/rollover.js test/rollover.test.js
git commit -m "feat: implement cycle rollover math and monthly cost normalization"
```

---

### Task 5: Subscriptions CRUD & Stats REST API

**Files:**
- Create: `src/server/routes/subs.routes.js`
- Test: `test/subs.test.js`

**Interfaces:**
- Consumes: `getDb()` from `src/server/db.js`, `rollover` functions from `src/server/utils/rollover.js`
- Produces: Express router `subsRouter`:
  - `GET /api/subscriptions` (query params: `category`, `status`, `search`, `sort`)
  - `GET /api/subscriptions/stats` (returns monthly total, annual total, active count, upcoming count)
  - `POST /api/subscriptions` (validates and creates)
  - `PUT /api/subscriptions/:id` (updates subscription)
  - `PATCH /api/subscriptions/:id/toggle` (toggles `is_active`)
  - `DELETE /api/subscriptions/:id` (removes subscription)

- [ ] **Step 1: Write failing tests for subscription CRUD and stats endpoints**

Create `test/subs.test.js`:
```javascript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/subs.test.js`  
Expected: FAIL (`../src/server/routes/subs.routes.js` not found).

- [ ] **Step 3: Implement subs.routes.js**

Create `src/server/routes/subs.routes.js`:
```javascript
import { Router } from 'express';
import { getDb } from '../db.js';
import { normalizeToMonthly, advanceToNextFutureRenewal } from '../utils/rollover.js';

export function createSubsRouter() {
  const router = Router();

  // GET all subscriptions with optional filters and rollover update
  router.get('/', (req, res) => {
    const db = getDb();
    const { category, status, search, sort } = req.query;

    let query = 'SELECT * FROM subscriptions WHERE 1=1';
    const params = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (status === 'active') {
      query += ' AND is_active = 1';
    } else if (status === 'paused') {
      query += ' AND is_active = 0';
    }
    if (search) {
      query += ' AND (name LIKE ? OR notes LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (sort === 'price_desc') {
      query += ' ORDER BY price DESC';
    } else if (sort === 'price_asc') {
      query += ' ORDER BY price ASC';
    } else if (sort === 'name') {
      query += ' ORDER BY name COLLATE NOCASE ASC';
    } else {
      query += ' ORDER BY next_renewal_date ASC';
    }

    const rows = db.prepare(query).all(...params);
    res.json(rows);
  });

  // GET spending metrics & upcoming count
  router.get('/stats', (req, res) => {
    const db = getDb();
    const activeSubs = db.prepare('SELECT * FROM subscriptions WHERE is_active = 1').all();
    const totalSubs = db.prepare('SELECT COUNT(*) as count FROM subscriptions').get().count;

    let monthlySpend = 0;
    const now = new Date().toISOString().slice(0, 10);
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let upcomingCount = 0;

    for (const sub of activeSubs) {
      monthlySpend += normalizeToMonthly(sub.price, sub.billing_cycle);
      if (sub.next_renewal_date >= now && sub.next_renewal_date <= in7Days) {
        upcomingCount++;
      }
    }

    res.json({
      totalCount: totalSubs,
      activeCount: activeSubs.length,
      monthlySpend: Number(monthlySpend.toFixed(2)),
      annualSpend: Number((monthlySpend * 12).toFixed(2)),
      upcomingIn7Days: upcomingCount
    });
  });

  // POST create subscription
  router.post('/', (req, res) => {
    const db = getDb();
    const { name, price, currency = 'USD', billing_cycle, next_renewal_date, category = 'General', notes, url } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Subscription name is required' });
    }
    if (typeof price !== 'number' || price < 0) {
      return res.status(400).json({ error: 'Valid positive price is required' });
    }
    const validCycles = ['weekly', 'monthly', 'quarterly', 'yearly'];
    if (!validCycles.includes(billing_cycle)) {
      return res.status(400).json({ error: `billing_cycle must be one of: ${validCycles.join(', ')}` });
    }
    if (!next_renewal_date || !/^\d{4}-\d{2}-\d{2}$/.test(next_renewal_date)) {
      return res.status(400).json({ error: 'next_renewal_date must be in YYYY-MM-DD format' });
    }

    const stmt = db.prepare(`
      INSERT INTO subscriptions (name, price, currency, billing_cycle, next_renewal_date, category, notes, url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(name.trim(), price, currency, billing_cycle, next_renewal_date, category.trim(), notes || null, url || null);

    const created = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(created);
  });

  // PUT update subscription
  router.put('/:id', (req, res) => {
    const db = getDb();
    const { id } = req.params;
    const { name, price, currency, billing_cycle, next_renewal_date, category, notes, url } = req.body;

    const existing = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const stmt = db.prepare(`
      UPDATE subscriptions SET
        name = COALESCE(?, name),
        price = COALESCE(?, price),
        currency = COALESCE(?, currency),
        billing_cycle = COALESCE(?, billing_cycle),
        next_renewal_date = COALESCE(?, next_renewal_date),
        category = COALESCE(?, category),
        notes = COALESCE(?, notes),
        url = COALESCE(?, url),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(name, price, currency, billing_cycle, next_renewal_date, category, notes, url, id);

    const updated = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
    res.json(updated);
  });

  // PATCH toggle active state
  router.patch('/:id/toggle', (req, res) => {
    const db = getDb();
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const newStatus = existing.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE subscriptions SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, id);
    res.json({ id: Number(id), is_active: newStatus });
  });

  // DELETE subscription
  router.delete('/:id', (req, res) => {
    const db = getDb();
    const { id } = req.params;
    const info = db.prepare('DELETE FROM subscriptions WHERE id = ?').run(id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    res.json({ success: true, message: 'Subscription deleted' });
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/subs.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/subs.routes.js test/subs.test.js
git commit -m "feat: implement subscriptions CRUD and financial metrics API endpoints"
```

---

### Task 6: Telegram Bot Notification Service & Settings API

**Files:**
- Create: `src/server/services/telegram.service.js`
- Create: `src/server/routes/settings.routes.js`
- Test: `test/telegram.test.js`

**Interfaces:**
- Consumes: Telegram Bot Token, Chat ID, and fetch API
- Produces:
  - `sendTelegramMessage({ botToken, chatId, message })` -> Promise<{ ok: boolean, error?: string }>
  - `formatRenewalMessage(subscription)` -> `string`
  - Express router `settingsRouter`:
    - `GET /api/settings` (masks bot token, returns chat ID, notify hours)
    - `PUT /api/settings` (updates bot token, chat ID)
    - `POST /api/settings/test-telegram` (sends test message)
    - `GET /api/notifications/logs` (returns recent 50 logs)

- [ ] **Step 1: Write failing tests for Telegram message formatting and delivery handling**

Create `test/telegram.test.js`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRenewalMessage, sendTelegramMessage } from '../src/server/services/telegram.service.js';

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

test('sendTelegramMessage returns error if botToken or chatId is missing', async () => {
  const res = await sendTelegramMessage({ botToken: '', chatId: '', message: 'Test' });
  assert.equal(res.ok, false);
  assert.ok(res.error.includes('Missing'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/telegram.test.js`  
Expected: FAIL (`../src/server/services/telegram.service.js` not found).

- [ ] **Step 3: Implement telegram.service.js and settings.routes.js**

Create `src/server/services/telegram.service.js`:
```javascript
export function formatRenewalMessage(subscription) {
  const { name, price, currency = '$', billing_cycle, next_renewal_date, category, url } = subscription;
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

export async function sendTelegramMessage({ botToken, chatId, message }) {
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

    const data = await response.json();
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.description || `Telegram API error: ${response.status}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
```

Create `src/server/routes/settings.routes.js`:
```javascript
import { Router } from 'express';
import { getDb } from '../db.js';
import { sendTelegramMessage } from '../services/telegram.service.js';

export function createSettingsRouter(config) {
  const router = Router();

  router.get('/settings', (req, res) => {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() || {};
    
    // Fall back to config if DB values are not yet set
    const token = settings.telegram_bot_token || config.telegramBotToken || '';
    const chatId = settings.telegram_chat_id || config.telegramChatId || '';
    
    // Mask token for security
    const maskedToken = token ? (token.length > 8 ? `${token.slice(0, 4)}...${token.slice(-4)}` : '****') : '';

    res.json({
      telegram_bot_token_masked: maskedToken,
      has_token: Boolean(token),
      telegram_chat_id: chatId,
      notify_hours_before: settings.notify_hours_before || config.notifyHoursBefore || 24,
      currency_symbol: settings.currency_symbol || '$'
    });
  });

  router.put('/settings', (req, res) => {
    const db = getDb();
    const { telegram_bot_token, telegram_chat_id, notify_hours_before, currency_symbol } = req.body;

    const current = db.prepare('SELECT * FROM settings WHERE id = 1').get();

    // If token passed is empty or omitted, keep current
    const tokenToSave = telegram_bot_token !== undefined && telegram_bot_token !== ''
      ? telegram_bot_token 
      : current.telegram_bot_token;

    db.prepare(`
      UPDATE settings SET
        telegram_bot_token = ?,
        telegram_chat_id = COALESCE(?, telegram_chat_id),
        notify_hours_before = COALESCE(?, notify_hours_before),
        currency_symbol = COALESCE(?, currency_symbol),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(tokenToSave, telegram_chat_id, notify_hours_before, currency_symbol);

    res.json({ success: true, message: 'Settings updated' });
  });

  router.post('/settings/test-telegram', async (req, res) => {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() || {};
    const botToken = req.body.telegram_bot_token || settings.telegram_bot_token || config.telegramBotToken;
    const chatId = req.body.telegram_chat_id || settings.telegram_chat_id || config.telegramChatId;

    const testMsg = `🚀 *Subscription Tracker Test Alert*\n\nYour Telegram notification configuration is working successfully!`;
    const result = await sendTelegramMessage({ botToken, chatId, message: testMsg });

    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, message: 'Test message delivered to Telegram' });
  });

  router.get('/notifications/logs', (req, res) => {
    const db = getDb();
    const logs = db.prepare('SELECT * FROM notification_logs ORDER BY sent_at DESC LIMIT 50').all();
    res.json(logs);
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/telegram.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/telegram.service.js src/server/routes/settings.routes.js test/telegram.test.js
git commit -m "feat: implement Telegram notification client and settings endpoints"
```

---

### Task 7: 24-Hour Notification Scheduler & Idempotency Engine

**Files:**
- Create: `src/server/services/scheduler.service.js`
- Test: `test/scheduler.test.js`

**Interfaces:**
- Consumes: `getDb()`, `config`, `telegramService`
- Produces:
  - `checkUpcomingRenewals({ nowIso, dryRun })` -> Promise<{ notifiedCount: number, errors: string[] }>
  - `startScheduler(config)` -> cron task instance
  - `advancePassedSubscriptions(nowIso)` -> updates subscriptions where renewal date has passed

- [ ] **Step 1: Write failing tests for scheduler 24-hour evaluation and duplicate prevention**

Create `test/scheduler.test.js`:
```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initDb, closeDb, getDb } from '../src/server/db.js';
import { checkUpcomingRenewals } from '../src/server/services/scheduler.service.js';

const TEST_DB = './data/test-scheduler.db';

before(() => {
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
  if (fs.existsSync(TEST_DB)) {
    fs.rmSync(TEST_DB, { force: true });
  }
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/scheduler.test.js`  
Expected: FAIL (`../src/server/services/scheduler.service.js` not found).

- [ ] **Step 3: Implement scheduler.service.js**

Create `src/server/services/scheduler.service.js`:
```javascript
import cron from 'node-cron';
import { getDb } from '../db.js';
import { formatRenewalMessage, sendTelegramMessage } from './telegram.service.js';
import { advanceToNextFutureRenewal } from '../utils/rollover.js';

export function calculateTomorrow(referenceDateStr) {
  const [y, m, d] = referenceDateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function autoAdvancePassedSubscriptions(todayStr) {
  const db = getDb();
  const pastSubs = db.prepare('SELECT * FROM subscriptions WHERE is_active = 1 AND next_renewal_date < ?').all(todayStr);

  for (const sub of pastSubs) {
    const nextDate = advanceToNextFutureRenewal(sub.next_renewal_date, sub.billing_cycle, todayStr);
    db.prepare(`
      UPDATE subscriptions SET
        next_renewal_date = ?,
        last_notified_renewal_date = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nextDate, sub.id);
  }
}

export async function checkUpcomingRenewals(options = {}) {
  const db = getDb();
  const today = options.referenceDate || new Date().toISOString().slice(0, 10);
  const targetRenewalDate = calculateTomorrow(today);

  // Auto-advance any subscriptions whose renewal date has already passed
  autoAdvancePassedSubscriptions(today);

  // Fetch settings for telegram token & chat ID
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() || {};
  const botToken = settings.telegram_bot_token || options.telegramBotToken || '';
  const chatId = settings.telegram_chat_id || options.telegramChatId || '';

  // Find active subscriptions renewing tomorrow that haven't been notified for this cycle
  const candidates = db.prepare(`
    SELECT * FROM subscriptions
    WHERE is_active = 1
      AND next_renewal_date = ?
      AND (last_notified_renewal_date IS NULL OR last_notified_renewal_date != ?)
  `).all(targetRenewalDate, targetRenewalDate);

  let notifiedCount = 0;
  const errors = [];
  const sender = options.mockSender || sendTelegramMessage;

  for (const sub of candidates) {
    const msg = formatRenewalMessage(sub);
    const res = await sender({ botToken, chatId, message: msg });

    if (res.ok) {
      // Mark as notified for this cycle
      db.prepare(`
        UPDATE subscriptions SET
          last_notified_renewal_date = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(targetRenewalDate, sub.id);

      // Log success
      db.prepare(`
        INSERT INTO notification_logs (subscription_id, subscription_name, renewal_date, status)
        VALUES (?, ?, ?, 'SUCCESS')
      `).run(sub.id, sub.name, targetRenewalDate);

      notifiedCount++;
    } else {
      errors.push(`Failed to notify ${sub.name}: ${res.error}`);
      db.prepare(`
        INSERT INTO notification_logs (subscription_id, subscription_name, renewal_date, status, error_message)
        VALUES (?, ?, ?, 'FAILED', ?)
      `).run(sub.id, sub.name, targetRenewalDate, res.error);
    }
  }

  return { notifiedCount, errors };
}

export function startScheduler(config) {
  // Check immediately on startup
  checkUpcomingRenewals({
    telegramBotToken: config.telegramBotToken,
    telegramChatId: config.telegramChatId
  }).catch(err => console.error('[Scheduler] Initial run error:', err));

  // Run every hour at minute 0: "0 * * * *"
  const task = cron.schedule('0 * * * *', async () => {
    try {
      const { notifiedCount, errors } = await checkUpcomingRenewals({
        telegramBotToken: config.telegramBotToken,
        telegramChatId: config.telegramChatId
      });
      if (notifiedCount > 0) {
        console.log(`[Scheduler] Sent ${notifiedCount} Telegram renewal alerts.`);
      }
      if (errors.length > 0) {
        console.error('[Scheduler] Errors:', errors);
      }
    } catch (err) {
      console.error('[Scheduler] Cron execution failed:', err);
    }
  });

  return task;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/scheduler.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/scheduler.service.js test/scheduler.test.js
git commit -m "feat: implement 24-hour notification scheduler with cycle idempotency"
```

---

### Task 8: Express Server Entrypoint & Route Assembly

**Files:**
- Create: `src/server/index.js`
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: `initDb`, `createAuthMiddleware`, all routers (`auth`, `subs`, `settings`), `startScheduler`
- Produces: Running Express server exposing APIs at `/api/*` and serving static client files in production from `dist/`

- [ ] **Step 1: Write integration test for Express server**

Create `test/server.test.js`:
```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import fs from 'node:fs';
import { createServer } from '../src/server/index.js';
import { closeDb } from '../src/server/db.js';

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server.test.js`  
Expected: FAIL (`../src/server/index.js` not found).

- [ ] **Step 3: Implement src/server/index.js**

Create `src/server/index.js`:
```javascript
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as defaultDbConfig } from './config.js';
import { initDb } from './db.js';
import { createAuthMiddleware } from './auth.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createSubsRouter } from './routes/subs.routes.js';
import { createSettingsRouter } from './routes/settings.routes.js';
import { startScheduler } from './services/scheduler.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer(cfg = defaultDbConfig) {
  initDb(cfg.dbPath);

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Public auth routes
  app.use('/api/auth', createAuthRouter(cfg));

  // Protected routes
  const requireAuth = createAuthMiddleware(cfg.sessionSecret);
  app.use('/api/subscriptions', requireAuth, createSubsRouter());
  app.use('/api', requireAuth, createSettingsRouter(cfg));

  // Serve static client build if present
  const distDir = path.resolve(__dirname, '../../dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  let schedulerTask = null;
  if (cfg.enableScheduler !== false) {
    schedulerTask = startScheduler(cfg);
  }

  return { app, schedulerTask };
}

// Start server when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { app } = createServer(defaultDbConfig);
  app.listen(defaultDbConfig.port, () => {
    console.log(`🚀 Subscription Tracker listening at http://localhost:${defaultDbConfig.port}`);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/index.js test/server.test.js
git commit -m "feat: assemble Express server with auth middleware, routers, and scheduler"
```

---

### Task 9: Frontend Foundation (Vite, Tailwind, API Client & Login Screen)

**Files:**
- Create: `src/client/vite.config.js`
- Create: `src/client/index.html`
- Create: `src/client/src/index.css`
- Create: `src/client/src/api.js`
- Create: `src/client/src/components/LoginView.jsx`
- Create: `src/client/src/components/Navbar.jsx`
- Create: `src/client/src/App.jsx`
- Create: `src/client/src/main.jsx`

**Interfaces:**
- Consumes: `/api/auth/*`
- Produces: Vite build producing `dist/index.html` and bundled assets. Handles session check and password login modal.

- [ ] **Step 1: Create client configuration files**

Create `src/client/vite.config.js`:
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(__dirname, '../../dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

Create `src/client/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SubTrack - Subscription Tracker</title>
  </head>
  <body class="bg-slate-950 text-slate-100 min-h-screen">
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

Create `src/client/src/index.css`:
```css
@import "tailwindcss";
```

Create `src/client/src/api.js`:
```javascript
export async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth-unauthorized'));
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP error ${res.status}`);
  }
  return data;
}

export const api = {
  checkAuth: () => fetchJson('/api/auth/status'),
  login: (password) => fetchJson('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => fetchJson('/api/auth/logout', { method: 'POST' }),

  getSubscriptions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchJson(`/api/subscriptions${query ? `?${query}` : ''}`);
  },
  getStats: () => fetchJson('/api/subscriptions/stats'),
  createSubscription: (data) => fetchJson('/api/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
  updateSubscription: (id, data) => fetchJson(`/api/subscriptions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleSubscription: (id) => fetchJson(`/api/subscriptions/${id}/toggle`, { method: 'PATCH' }),
  deleteSubscription: (id) => fetchJson(`/api/subscriptions/${id}`, { method: 'DELETE' }),

  getSettings: () => fetchJson('/api/settings'),
  updateSettings: (data) => fetchJson('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
  testTelegram: (data) => fetchJson('/api/settings/test-telegram', { method: 'POST', body: JSON.stringify(data) }),
  getLogs: () => fetchJson('/api/notifications/logs'),
};
```

- [ ] **Step 2: Implement Navbar.jsx, LoginView.jsx, App.jsx, and main.jsx**

Create `src/client/src/components/Navbar.jsx`:
```jsx
import React from 'react';
import { BellRing, Settings, LogOut } from 'lucide-react';

export function Navbar({ onOpenSettings, onLogout }) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur-md sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
            <BellRing className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-white">SubTrack</h1>
            <p className="text-xs text-slate-400">Telegram 24h Alerts</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
          <button
            onClick={onLogout}
            title="Log Out"
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
```

Create `src/client/src/components/LoginView.jsx`:
```jsx
import React, { useState } from 'react';
import { Lock, KeyRound, AlertCircle, ArrowRight } from 'lucide-react';
import { api } from '../api.js';

export function LoginView({ onLoginSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.login(password);
      onLoginSuccess();
    } catch (err) {
      setError(err.message || 'Invalid password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20">
            <Lock className="w-8 h-8" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center text-white mb-2">Welcome to SubTrack</h2>
        <p className="text-sm text-center text-slate-400 mb-8">Enter your access password to manage subscriptions</p>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Access Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                autoFocus
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
          >
            <span>{loading ? 'Verifying...' : 'Sign In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
```

Create `src/client/src/App.jsx`:
```jsx
import React, { useState, useEffect } from 'react';
import { api } from './api.js';
import { Navbar } from './components/Navbar.jsx';
import { LoginView } from './components/LoginView.jsx';

export function App() {
  const [authenticated, setAuthenticated] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    api.checkAuth()
      .then((data) => setAuthenticated(data.authenticated))
      .catch(() => setAuthenticated(false));

    function handleUnauthorized() {
      setAuthenticated(false);
    }
    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, []);

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        Loading SubTrack...
      </div>
    );
  }

  if (!authenticated) {
    return <LoginView onLoginSuccess={() => setAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navbar
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLogout={async () => {
          await api.logout();
          setAuthenticated(false);
        }}
      />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <div className="text-center text-slate-500 py-12">
          Dashboard components loading...
        </div>
      </main>
    </div>
  );
}
```

Create `src/client/src/main.jsx`:
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: Run build test to verify Vite compilation**

Run: `npm run build`  
Expected: PASS (builds to `dist/index.html`).

- [ ] **Step 4: Commit**

```bash
git add src/client/ test/
git commit -m "feat: initialize Vite React frontend with auth screen and Tailwind styling"
```

---

### Task 10: Complete UI Dashboard (Metrics, Subscriptions, Modals & Settings)

**Files:**
- Create: `src/client/src/components/MetricsBar.jsx`
- Create: `src/client/src/components/SubscriptionCard.jsx`
- Create: `src/client/src/components/SubscriptionModal.jsx`
- Create: `src/client/src/components/SettingsModal.jsx`
- Modify: `src/client/src/App.jsx`

**Interfaces:**
- Consumes: `api` client
- Produces: Full interactive UI dashboard with filtering, search, add/edit modal, active toggling, and Telegram test sender.

- [ ] **Step 1: Implement MetricsBar.jsx**

Create `src/client/src/components/MetricsBar.jsx`:
```jsx
import React from 'react';
import { DollarSign, Calendar, Activity, Clock } from 'lucide-react';

export function MetricsBar({ stats }) {
  const cards = [
    {
      label: 'Monthly Burn Rate',
      value: `$${(stats?.monthlySpend || 0).toFixed(2)}`,
      sub: 'Normalized across all cycles',
      icon: DollarSign,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
    {
      label: 'Annual Cost',
      value: `$${(stats?.annualSpend || 0).toFixed(2)}`,
      sub: 'Projected 12-month total',
      icon: Calendar,
      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    },
    {
      label: 'Active Subscriptions',
      value: `${stats?.activeCount || 0} / ${stats?.totalCount || 0}`,
      sub: 'Currently enabled',
      icon: Activity,
      color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    },
    {
      label: 'Renewing Soon (7 Days)',
      value: stats?.upcomingIn7Days || 0,
      sub: 'Approaching renewals',
      icon: Clock,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-400">{c.label}</span>
              <div className={`p-2 rounded-xl border ${c.color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white tracking-tight">{c.value}</div>
              <p className="text-xs text-slate-500 mt-1">{c.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Implement SubscriptionCard.jsx**

Create `src/client/src/components/SubscriptionCard.jsx`:
```jsx
import React from 'react';
import { Calendar, ExternalLink, Edit2, Trash2, Power } from 'lucide-react';

export function SubscriptionCard({ sub, onEdit, onDelete, onToggle }) {
  const daysUntil = Math.ceil((new Date(sub.next_renewal_date) - new Date()) / (1000 * 60 * 60 * 24));
  const isImminent = daysUntil <= 1 && daysUntil >= 0;
  const isSoon = daysUntil > 1 && daysUntil <= 3;

  return (
    <div className={`bg-slate-900 border rounded-2xl p-5 flex flex-col justify-between transition-all ${
      sub.is_active ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/50 opacity-60'
    }`}>
      <div>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 mb-1.5">
              {sub.category || 'General'}
            </span>
            <h3 className="font-bold text-lg text-white leading-snug">{sub.name}</h3>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-white">${Number(sub.price).toFixed(2)}</div>
            <div className="text-xs text-slate-400 capitalize">{sub.billing_cycle}</div>
          </div>
        </div>

        {sub.notes && (
          <p className="text-xs text-slate-400 mb-4 line-clamp-2">{sub.notes}</p>
        )}
      </div>

      <div className="pt-4 border-t border-slate-800/80 mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-300">{sub.next_renewal_date}</span>
          {sub.is_active === 1 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isImminent
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse'
                : isSoon
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-500'
            }`}>
              {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow (24h)' : `in ${daysUntil}d`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {sub.url && (
            <a
              href={sub.url}
              target="_blank"
              rel="noreferrer"
              title="Visit site"
              className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={() => onToggle(sub)}
            title={sub.is_active ? 'Pause subscription' : 'Activate subscription'}
            className={`p-1.5 rounded-lg transition-colors ${
              sub.is_active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-500 hover:bg-slate-800'
            }`}
          >
            <Power className="w-4 h-4" />
          </button>
          <button
            onClick={() => onEdit(sub)}
            title="Edit"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(sub)}
            title="Delete"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement SubscriptionModal.jsx and SettingsModal.jsx**

Create `src/client/src/components/SubscriptionModal.jsx`:
```jsx
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export function SubscriptionModal({ isOpen, onClose, onSave, editingSub }) {
  const [form, setForm] = useState({
    name: '',
    price: '',
    billing_cycle: 'monthly',
    next_renewal_date: '',
    category: 'General',
    url: '',
    notes: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingSub) {
      setForm({
        name: editingSub.name || '',
        price: editingSub.price || '',
        billing_cycle: editingSub.billing_cycle || 'monthly',
        next_renewal_date: editingSub.next_renewal_date || '',
        category: editingSub.category || 'General',
        url: editingSub.url || '',
        notes: editingSub.notes || '',
      });
    } else {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      setForm({
        name: '',
        price: '',
        billing_cycle: 'monthly',
        next_renewal_date: tomorrow,
        category: 'General',
        url: '',
        notes: '',
      });
    }
    setError('');
  }, [editingSub, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError('Name is required');
    if (!form.price || Number(form.price) < 0) return setError('Valid price is required');
    if (!form.next_renewal_date) return setError('Renewal date is required');

    try {
      await onSave({
        ...form,
        price: Number(form.price),
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <h2 className="text-xl font-bold text-white">{editingSub ? 'Edit Subscription' : 'Add New Subscription'}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Service Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Netflix, Spotify, GitHub"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Cost ($) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="15.99"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Billing Cycle</label>
              <select
                value={form.billing_cycle}
                onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Next Renewal Date *</label>
              <input
                type="date"
                required
                value={form.next_renewal_date}
                onChange={(e) => setForm({ ...form, next_renewal_date: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Category</label>
              <input
                type="text"
                placeholder="Streaming, SaaS, Utilities..."
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Website / Account URL</label>
            <input
              type="url"
              placeholder="https://..."
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Notes</label>
            <textarea
              rows="2"
              placeholder="Credit card used, plan details..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white bg-slate-800 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/20"
            >
              {editingSub ? 'Save Changes' : 'Add Subscription'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

Create `src/client/src/components/SettingsModal.jsx`:
```jsx
import React, { useState, useEffect } from 'react';
import { X, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../api.js';

export function SettingsModal({ isOpen, onClose }) {
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [maskedToken, setMaskedToken] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (isOpen) {
      api.getSettings().then((s) => {
        setMaskedToken(s.telegram_bot_token_masked || '');
        setChatId(s.telegram_chat_id || '');
      });
      api.getLogs().then(setLogs);
      setStatusMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    setStatusMsg('');
    try {
      await api.updateSettings({
        telegram_bot_token: token || undefined,
        telegram_chat_id: chatId,
      });
      setStatusMsg('Telegram settings updated successfully!');
      setIsError(false);
      setToken('');
      const updated = await api.getSettings();
      setMaskedToken(updated.telegram_bot_token_masked);
    } catch (err) {
      setStatusMsg(err.message || 'Failed to save settings');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleTestNotification() {
    setLoading(true);
    setStatusMsg('');
    try {
      await api.testTelegram({
        telegram_bot_token: token || undefined,
        telegram_chat_id: chatId,
      });
      setStatusMsg('Test alert delivered to Telegram successfully! Check your chat.');
      setIsError(false);
      api.getLogs().then(setLogs);
    } catch (err) {
      setStatusMsg(`Delivery failed: ${err.message}`);
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white">Telegram Notification Settings</h2>
            <p className="text-xs text-slate-400">Receive alerts 24 hours before any subscription renews</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {statusMsg && (
          <div className={`mt-4 p-3 rounded-xl text-sm flex items-center gap-2 ${
            isError ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
          }`}>
            {isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{statusMsg}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Telegram Bot Token
            </label>
            <input
              type="text"
              placeholder={maskedToken ? `Current: ${maskedToken}` : 'e.g. 123456789:ABCdefGhIJKlmNo...'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono text-sm"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Create a bot with <span className="text-indigo-400">@BotFather</span> on Telegram to get your token.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Telegram Chat ID
            </label>
            <input
              type="text"
              placeholder="e.g. 987654321"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono text-sm"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Message <span className="text-indigo-400">@userinfobot</span> on Telegram to discover your Chat ID.
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              type="button"
              disabled={loading || (!chatId && !maskedToken)}
              onClick={handleTestNotification}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-xl transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Test Notification</span>
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/20 disabled:opacity-50"
            >
              Save Settings
            </button>
          </div>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Recent Notification History</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-xs text-slate-500">No notifications sent yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="text-xs flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800/80">
                  <div>
                    <span className="font-medium text-white">{log.subscription_name}</span>
                    <span className="text-slate-400 ml-2">Cycle: {log.renewal_date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      log.status === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {log.status}
                    </span>
                    <span className="text-slate-500">{new Date(log.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update App.jsx with full dashboard view**

Update `src/client/src/App.jsx`:
```jsx
import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter } from 'lucide-react';
import { api } from './api.js';
import { Navbar } from './components/Navbar.jsx';
import { LoginView } from './components/LoginView.jsx';
import { MetricsBar } from './components/MetricsBar.jsx';
import { SubscriptionCard } from './components/SubscriptionCard.jsx';
import { SubscriptionModal } from './components/SubscriptionModal.jsx';
import { SettingsModal } from './components/SettingsModal.jsx';

export function App() {
  const [authenticated, setAuthenticated] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('next_renewal');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState(null);

  async function loadData() {
    try {
      const [subs, st] = await Promise.all([
        api.getSubscriptions({ search, category: categoryFilter, sort: sortOrder }),
        api.getStats(),
      ]);
      setSubscriptions(subs);
      setStats(st);
    } catch (err) {
      console.error('Failed loading subscriptions:', err);
    }
  }

  useEffect(() => {
    api.checkAuth()
      .then((data) => {
        setAuthenticated(data.authenticated);
        if (data.authenticated) loadData();
      })
      .catch(() => setAuthenticated(false));

    function handleUnauthorized() {
      setAuthenticated(false);
    }
    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    if (authenticated) {
      loadData();
    }
  }, [search, categoryFilter, sortOrder, authenticated]);

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        Loading SubTrack...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <LoginView
        onLoginSuccess={() => {
          setAuthenticated(true);
          loadData();
        }}
      />
    );
  }

  const categories = Array.from(new Set(subscriptions.map((s) => s.category).filter(Boolean)));

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navbar
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLogout={async () => {
          await api.logout();
          setAuthenticated(false);
        }}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <MetricsBar stats={stats} />

        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between mb-6">
          <div className="flex flex-1 gap-2 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search subscriptions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            {categories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}

            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="next_renewal">Sort: Next Renewal</option>
              <option value="price_desc">Sort: Highest Cost</option>
              <option value="price_asc">Sort: Lowest Cost</option>
              <option value="name">Sort: Name (A-Z)</option>
            </select>
          </div>

          <button
            onClick={() => {
              setEditingSub(null);
              setIsSubModalOpen(true);
            }}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Subscription</span>
          </button>
        </div>

        {subscriptions.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-12 text-center">
            <h3 className="font-semibold text-lg text-white mb-2">No subscriptions found</h3>
            <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">
              Get started by adding recurring services like Netflix, Spotify, or cloud hosting.
            </p>
            <button
              onClick={() => {
                setEditingSub(null);
                setIsSubModalOpen(true);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl"
            >
              Add First Subscription
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subscriptions.map((sub) => (
              <SubscriptionCard
                key={sub.id}
                sub={sub}
                onEdit={(s) => {
                  setEditingSub(s);
                  setIsSubModalOpen(true);
                }}
                onDelete={async (s) => {
                  if (confirm(`Delete ${s.name}?`)) {
                    await api.deleteSubscription(s.id);
                    loadData();
                  }
                }}
                onToggle={async (s) => {
                  await api.toggleSubscription(s.id);
                  loadData();
                }}
              />
            ))}
          </div>
        )}
      </main>

      <SubscriptionModal
        isOpen={isSubModalOpen}
        editingSub={editingSub}
        onClose={() => setIsSubModalOpen(false)}
        onSave={async (formData) => {
          if (editingSub) {
            await api.updateSubscription(editingSub.id, formData);
          } else {
            await api.createSubscription(formData);
          }
          loadData();
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 5: Run client build to verify everything compiles cleanly**

Run: `npm run build`  
Expected: PASS (generates `dist/index.html` and assets).

- [ ] **Step 6: Commit**

```bash
git add src/client/
git commit -m "feat: complete interactive subscription dashboard, modals, and Telegram settings"
```

---

### Task 11: End-to-End System Verification & Documentation

**Files:**
- Create: `README.md`
- Test: Full test suite `npm test`

- [ ] **Step 1: Create project README.md with setup and execution instructions**

Create `README.md`:
```markdown
# SubTrack - Subscription Tracker with Telegram Alerts

A lightweight, self-hosted web application to track recurring subscriptions and receive automatic Telegram alerts 24 hours before any subscription renews.

## Features
- **Single Password Access:** Secure access protected by `APP_PASSWORD`.
- **24-Hour Renewal Alerts:** Automated background scheduler checks hourly and sends formatted Telegram reminders 24h in advance.
- **Idempotency Guarantee:** Prevents duplicate notifications for the same renewal cycle.
- **Auto-Rollover:** Automatically advances subscription renewal dates to the next cycle once passed.
- **Financial Metrics:** Real-time normalized monthly burn rate, annual spend, and upcoming renewals.
- **Single Process:** Unified Express server hosting both API and production React UI on port 3000.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and set APP_PASSWORD, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
   ```

3. **Build frontend & run:**
   ```bash
   npm run build
   npm start
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Running Tests
```bash
npm test
```
```

- [ ] **Step 2: Run all backend tests**

Run: `npm test`  
Expected: PASS (All test suites pass: config, db, auth, rollover, subs, telegram, scheduler, server).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add setup and usage guide in README"
```
