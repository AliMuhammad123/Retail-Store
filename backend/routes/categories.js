// routes/categories.js
import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// List categories with product count + inventory value
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name,
           COUNT(p.id)                         AS product_count,
           COALESCE(SUM(p.quantity), 0)        AS total_units,
           COALESCE(SUM(p.quantity * p.cost_price), 0)    AS stock_cost_value,
           COALESCE(SUM(p.quantity * p.selling_price), 0) AS stock_retail_value
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id
    ORDER BY c.name
  `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const info = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name.trim());
    res.status(201).json({ id: info.lastInsertRowid, name: name.trim() });
  } catch (e) {
    res.status(409).json({ error: 'Category already exists' });
  }
});

router.put('/:id', (req, res) => {
  const { name } = req.body;
  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
