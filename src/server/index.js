import 'dotenv/config';
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
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { app } = createServer(defaultDbConfig);
  app.listen(defaultDbConfig.port, () => {
    console.log(`🚀 Subscription Tracker listening at http://localhost:${defaultDbConfig.port}`);
  });
}
