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

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP port for unified server | `3000` |
| `DB_PATH` | Path to SQLite database file | `./data/subscriptions.db` |
| `APP_PASSWORD` | Password required to unlock the application | `admin` |
| `SESSION_SECRET` | Secret key used for signing session auth cookies | `change-this-to-a-random-secret` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token from `@BotFather` | `""` |
| `TELEGRAM_CHAT_ID` | Telegram chat ID for delivery | `""` |
| `NOTIFY_HOURS_BEFORE` | Advance notification threshold in hours | `24` |

Telegram settings can also be dynamically configured or updated directly in the UI under Settings.

## Development Scripts

- `npm test`: Run full backend and API test suite (Node test runner)
- `npm run dev:server`: Run server with Node watch mode (`--watch`)
- `npm run dev:client`: Run Vite client development server with HMR
- `npm run build`: Build production frontend bundle into `dist/`
- `npm start`: Start production Express server serving API and `dist/`

## Running Tests
```bash
npm test
```
