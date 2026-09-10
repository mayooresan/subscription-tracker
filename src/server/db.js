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
