# Subscription Tracking App Design Specification

**Date:** 2026-09-10  
**Status:** Approved for Implementation  
**Project:** Subscription Tracker with 24-Hour Renewal Notifications  

---

## 1. Overview & Goals

A lightweight, self-hosted web application for a single user to track recurring subscriptions (streaming, SaaS, utilities, memberships) and receive automatic notifications via a Telegram Bot exactly 24 hours before any subscription is scheduled to renew.

### Key Requirements
- **Runtime & Backend:** Node.js (v18+) with Express.
- **Frontend:** Modern, responsive Single Page Application (Vite + React + Tailwind CSS), statically served by Express in production.
- **Database:** SQLite via `better-sqlite3` with Write-Ahead Logging (WAL mode enabled).
- **Authentication:** Single password access (`APP_PASSWORD` in `.env`), secured with constant-time comparison and HTTP-only signed session cookies. No complex multi-user management.
- **Notification Engine:** Recurring background worker (`node-cron`) checking every hour for subscriptions renewing within the next 24 hours, sending formatted markdown messages via Telegram Bot API, with duplicate prevention (idempotency).

---

## 2. Architecture & Directory Layout

The application is structured as a unified, single-process repository. A single command (`npm start`) runs both the API, background scheduler, and static file server on one port (default `3000`).

```text
subscription/
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-09-10-subscription-tracker-design.md
├── src/
│   ├── server/
│   │   ├── index.js                # Express app entry, static serving, startup scheduler
│   │   ├── config.js               # Environment variables, defaults
│   │   ├── db.js                   # SQLite connection, pragmas, schema migrations
│   │   ├── auth.js                 # Password validation & cookie session middleware
│   │   ├── routes/
│   │   │   ├── auth.routes.js      # /api/auth (login, logout, session status)
│   │   │   ├── subs.routes.js      # /api/subscriptions (CRUD, filters, stats)
│   │   │   └── settings.routes.js  # /api/settings (Telegram credentials, test send)
│   │   └── services/
│   │       ├── telegram.service.js # Telegram Bot API client (fetch)
│   │       └── scheduler.service.js# node-cron 24h notification scanner & auto-rollover
│   └── client/                     # Vite + React + Tailwind CSS
│       ├── index.html
│       ├── vite.config.js
│       ├── tailwind.config.js
│       ├── postcss.config.js
│       └── src/
│           ├── main.jsx
│           ├── App.jsx
│           ├── api.js              # Client HTTP API helper
│           ├── components/
│           │   ├── Navbar.jsx
│           │   ├── MetricsBar.jsx  # Monthly equivalent burn rate, active counts
│           │   ├── SubscriptionList.jsx
│           │   ├── SubscriptionCard.jsx
│           │   ├── SubscriptionModal.jsx # Add / Edit modal
│           │   ├── SettingsModal.jsx     # Telegram configuration & test button
│           │   ├── NotificationLogs.jsx  # Audit log viewer
│           │   └── LoginView.jsx         # Password login screen
│           └── utils/
│               └── formatters.js   # Date, currency, billing cycle calculations
└── test/
    ├── auth.test.js
    ├── subscriptions.test.js
    ├── rollover.test.js
    └── scheduler.test.js
```

---

## 3. Database Schema (SQLite)

The database file is stored locally at `data/subscriptions.db` (gitignored).

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Application settings (single row with id=1)
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  notify_hours_before INTEGER DEFAULT 24,
  currency_symbol TEXT DEFAULT '$',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_renewal_date TEXT NOT NULL, -- YYYY-MM-DD
  category TEXT DEFAULT 'General',
  is_active INTEGER DEFAULT 1,     -- 1 = active, 0 = paused/cancelled
  notes TEXT,
  url TEXT,
  last_notified_renewal_date TEXT, -- Tracks the specific cycle date notified to prevent duplicate alerts
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit log of sent notifications
CREATE TABLE IF NOT EXISTS notification_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
  subscription_name TEXT NOT NULL,
  renewal_date TEXT NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL, -- 'SUCCESS' or 'FAILED'
  error_message TEXT
);
```

---

## 4. Authentication & Security

1. **Password Storage & Matching:**
   - Password configured via `APP_PASSWORD` in `.env`.
   - On `POST /api/auth/login`, Express validates input using `crypto.timingSafeEqual` comparing SHA-256 hashes of input vs `APP_PASSWORD`.
2. **Session Handling:**
   - On successful verification, signs an encrypted or HMAC-signed session cookie (`sub_session`) using `SESSION_SECRET` (configured in `.env` or auto-generated random key on boot).
   - Cookie attributes: `httpOnly: true`, `sameSite: 'lax'`, `maxAge: 30 days`.
3. **Route Guard:**
   - `requireAuth` middleware validates the cookie signature for all `/api/subscriptions` and `/api/settings` endpoints, returning `401 Unauthorized` on failure.
4. **Logout:**
   - `POST /api/auth/logout` clears the session cookie.

---

## 5. Subscription Lifecycle & Recurrence Rollover

### Supported Billing Cycles
- `weekly`: adds 7 days to `next_renewal_date`
- `monthly`: adds 1 calendar month (preserving day of month or last day if shorter)
- `quarterly`: adds 3 calendar months
- `yearly`: adds 1 calendar year

### Auto-Rollover Logic
When evaluating subscriptions (in scheduler or listing), if `next_renewal_date < today` and `is_active = 1`:
The date automatically advances forward by the billing cycle until `next_renewal_date >= today`.
This guarantees subscriptions remain current without manual intervention.

---

## 6. 24-Hour Notification Engine & Telegram Integration

### 1. Scheduler Engine (`node-cron`)
- **Execution Interval:** Runs every hour at minute 0 (`0 * * * *`), plus immediately once on server boot.
- **Query Criteria:**
  Find active subscriptions where:
  - `is_active = 1`
  - Difference in hours between `now` and `next_renewal_date` (at 00:00 local time or target time) is `<= 24 hours` and `>= 0`.
  - `last_notified_renewal_date IS NULL OR last_notified_renewal_date != next_renewal_date`.
- **Idempotency Execution:**
  For each matching subscription:
  1. Attempt Telegram message delivery.
  2. If successful:
     - Update subscription: `UPDATE subscriptions SET last_notified_renewal_date = ? WHERE id = ?`.
     - Insert into `notification_logs` with status `'SUCCESS'`.
  3. If failed:
     - Insert into `notification_logs` with status `'FAILED'` and `error_message`.
     - Do not update `last_notified_renewal_date` so the next run can retry, or display alert in dashboard.

### 2. Telegram Bot Client
- Uses native `fetch` calling `POST https://api.telegram.org/bot<TOKEN>/sendMessage`.
- Token and Chat ID are resolved from:
  1. Database `settings` table (configured via UI).
  2. Fallback to `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` environment variables.
- Payload formatted in Telegram Markdown:
  ```text
  🔔 *Subscription Renewal Alert*

  Your subscription for *{name}* will renew in 24 hours!

  💵 *Amount:* {currency} {price} ({billing_cycle})
  📅 *Renewal Date:* {next_renewal_date}
  📂 *Category:* {category}
  🔗 *Manage:* {url or app_url}
  ```

---

## 7. REST API Endpoints

### Auth Endpoints
- `POST /api/auth/login` — Body: `{ password }`. Returns `{ success: true }`.
- `POST /api/auth/logout` — Clears cookie.
- `GET /api/auth/status` — Returns `{ authenticated: boolean }`.

### Subscription Endpoints (`requireAuth`)
- `GET /api/subscriptions` — Returns list of subscriptions (supports `?category=`, `?status=`, `?sort=`).
- `GET /api/subscriptions/stats` — Returns summary: total monthly equivalent cost, total annual cost, active count, upcoming renewals (next 7 days).
- `POST /api/subscriptions` — Creates a subscription. Body: `{ name, price, currency, billing_cycle, next_renewal_date, category, url, notes }`.
- `PUT /api/subscriptions/:id` — Updates subscription.
- `PATCH /api/subscriptions/:id/toggle` — Toggles active/paused state.
- `DELETE /api/subscriptions/:id` — Deletes subscription.

### Settings & Notification Endpoints (`requireAuth`)
- `GET /api/settings` — Returns current settings (bot token masked, chat ID, notify hours).
- `PUT /api/settings` — Updates settings (token, chat ID).
- `POST /api/settings/test-telegram` — Sends an instant test message to Telegram to verify credentials.
- `GET /api/notifications/logs` — Returns recent 50 notification logs.
- `POST /api/notifications/check-now` — Triggers an on-demand scheduler evaluation run.

---

## 8. Frontend UI / UX Specification

Single-page application with responsive desktop and mobile support:
1. **Header & Navigation:**
   - App title ("SubTrack"), status indicator, Settings button, and Logout button.
2. **Metrics Overview:**
   - **Monthly Spend**: Sum of normalized monthly costs across all active subscriptions (`yearly / 12`, `quarterly / 3`, `weekly * 4.33`, `monthly`).
   - **Annual Spend**: Projected yearly total.
   - **Active Subscriptions**: Count of active subscriptions.
   - **Renewing Next**: The earliest renewal date.
3. **Controls Bar:**
   - Search input (by name or notes).
   - Category filter pills/dropdown (All, Streaming, SaaS, Cloud, Utilities, etc.).
   - Sort dropdown (Renewal Date ascending/descending, Price high/low, Name A-Z).
   - "+ Add Subscription" primary button.
4. **Subscription Grid / Cards:**
   - Card displays: Name, Category badge, Price & Cycle, Next Renewal Date, "Renewing in X days" badge (amber if <= 2 days, red if today).
   - Toggle button (Active / Paused).
   - Edit & Delete buttons.
5. **Add / Edit Modal:**
   - Form with input validation (Name required, price > 0, valid date).
6. **Settings & Notification Drawer:**
   - Telegram Bot Token & Chat ID fields.
   - Instructions on how to get token via `@BotFather` and chat ID via `@userinfobot`.
   - "Send Test Message" button with live status indicator (success/failure details).
   - Table of recent notification logs.

---

## 9. Testing Strategy

Using Node.js native test runner (`node:test` + `assert` + `supertest`):
- `test/auth.test.js`:
  - Verify login with correct password returns 200 and sets cookie.
  - Verify login with incorrect password returns 401.
  - Verify protected routes reject unauthenticated requests.
- `test/subscriptions.test.js`:
  - CRUD operations on subscriptions table.
  - Input validation (missing name, invalid price, invalid cycle).
  - Monthly cost calculation stats.
- `test/rollover.test.js`:
  - Verify date arithmetic for weekly, monthly, quarterly, yearly additions.
  - Leap year and month-end boundary handling (e.g. Jan 31 + 1 month).
- `test/scheduler.test.js`:
  - Subscriptions renewing within 24 hours trigger notification.
  - Subscriptions renewing in > 24 hours are ignored.
  - Inactive subscriptions are ignored.
  - Idempotency test: verify second run does not re-send notification for the same cycle.

---

## 10. Deployment & Execution

```bash
# Clone & install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env: APP_PASSWORD, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

# Build frontend & run server
npm run build
npm start
# Server listens at http://localhost:3000
```
