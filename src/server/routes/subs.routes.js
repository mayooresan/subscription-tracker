import { Router } from 'express';
import { getDb } from '../db.js';
import { normalizeToMonthly, advanceToNextFutureRenewal } from '../utils/rollover.js';

export function createSubsRouter() {
  const router = Router();

  // GET all subscriptions with optional filters
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
    const { name, price, currency = 'USD', billing_cycle, next_renewal_date, category = 'General', notes, url } = req.body || {};

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
    const { name, price, currency, billing_cycle, next_renewal_date, category, notes, url } = req.body || {};

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
