// routes/expenses.js
import { Router } from 'express';
import db from '../db/database.js';
import { rangeFromQuery } from './_range.js';

const router = Router();

router.get('/', (req, res) => {
  const { from, to } = rangeFromQuery(req);
  const q = (req.query.q || '').trim();
  const rows = q
    ? db.prepare(`SELECT * FROM expenses WHERE date BETWEEN @from AND @to AND (category LIKE @like OR description LIKE @like) ORDER BY date DESC`).all({ from, to, like: `%${q}%` })
    : db.prepare(`SELECT * FROM expenses WHERE date BETWEEN ? AND ? ORDER BY date DESC`).all(from, to);
  res.json(rows);
});

// Breakdown by category for a period
router.get('/breakdown', (req, res) => {
  const { from, to } = rangeFromQuery(req);
  const rows = db.prepare(`
    SELECT category, COUNT(*) AS count, SUM(amount) AS total
    FROM expenses WHERE date BETWEEN ? AND ?
    GROUP BY category ORDER BY total DESC
  `).all(from, to);
  const total = rows.reduce((s, r) => s + r.total, 0);
  res.json({ total, breakdown: rows });
});

router.post('/', (req, res) => {
  const { category = 'General', amount, description, date, payment_method = 'cash' } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Valid amount required' });
  const d = date || new Date().toISOString().slice(0, 19).replace('T', ' ');
  const info = db.prepare(
    'INSERT INTO expenses (date, category, amount, description, payment_method) VALUES (?, ?, ?, ?, ?)'
  ).run(d, category, Number(amount), description || null, payment_method);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { category, amount, description, date, payment_method } = req.body;
  db.prepare('UPDATE expenses SET category=?, amount=?, description=?, date=?, payment_method=COALESCE(?, payment_method) WHERE id=?')
    .run(category, Number(amount), description || null, date, payment_method || null, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
