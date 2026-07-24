// routes/products.js
import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// List products (optional ?q= search across name, SKU, barcode, category)
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  const where = q ? `WHERE p.name LIKE @like OR p.sku LIKE @like OR p.barcode LIKE @like OR c.name LIKE @like` : '';
  const rows = db.prepare(`
    SELECT p.*, c.name AS category_name,
           (p.selling_price - p.cost_price)                       AS margin_per_unit,
           (p.quantity * p.cost_price)                            AS stock_cost_value,
           (p.quantity * p.selling_price)                         AS stock_retail_value,
           CASE WHEN p.quantity <= p.reorder_level THEN 1 ELSE 0 END AS low_stock
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    ${where}
    ORDER BY p.name
  `).all(q ? { like: `%${q}%` } : {});
  res.json(rows);
});

// Look up a single product by exact barcode or SKU (used by the scanner at POS)
router.get('/lookup', (req, res) => {
  const code = (req.query.code || '').trim();
  if (!code) return res.status(400).json({ error: 'code required' });
  const row = db.prepare(`
    SELECT p.*, c.name AS category_name
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.barcode = ? OR p.sku = ? LIMIT 1
  `).get(code, code);
  if (!row) return res.status(404).json({ error: 'No product with that code' });
  res.json(row);
});

// Inventory summary: totals + per-category breakdown + low-stock list
router.get('/inventory/summary', (req, res) => {
  const totals = db.prepare(`
    SELECT COUNT(*)                                    AS product_count,
           COALESCE(SUM(quantity), 0)                  AS total_units,
           COALESCE(SUM(quantity * cost_price), 0)     AS total_cost_value,
           COALESCE(SUM(quantity * selling_price), 0)  AS total_retail_value
    FROM products
  `).get();
  totals.potential_profit = totals.total_retail_value - totals.total_cost_value;

  const byCategory = db.prepare(`
    SELECT COALESCE(c.name, 'Uncategorized') AS category,
           COUNT(p.id)                       AS product_count,
           COALESCE(SUM(p.quantity), 0)      AS units,
           COALESCE(SUM(p.quantity * p.cost_price), 0)    AS cost_value,
           COALESCE(SUM(p.quantity * p.selling_price), 0) AS retail_value
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    GROUP BY c.id
    ORDER BY cost_value DESC
  `).all();

  const lowStock = db.prepare(`
    SELECT id, name, sku, quantity, reorder_level
    FROM products WHERE quantity <= reorder_level ORDER BY quantity ASC
  `).all();

  res.json({ totals, byCategory, lowStock });
});

router.post('/', (req, res) => {
  const { name, sku, barcode, category_id, cost_price, selling_price, quantity, reorder_level } = req.body;
  if (!name) return res.status(400).json({ error: 'Product name is required' });
  try {
    const info = db.prepare(`INSERT INTO products
      (name, sku, barcode, category_id, cost_price, selling_price, quantity, reorder_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      name, sku || null, barcode || null, category_id || null,
      cost_price || 0, selling_price || 0, quantity || 0, reorder_level ?? 5
    );
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(409).json({ error: 'SKU must be unique' });
  }
});

router.put('/:id', (req, res) => {
  const { name, sku, barcode, category_id, cost_price, selling_price, quantity, reorder_level } = req.body;
  db.prepare(`UPDATE products SET
      name=?, sku=?, barcode=?, category_id=?, cost_price=?, selling_price=?, quantity=?, reorder_level=?
      WHERE id=?`).run(
    name, sku || null, barcode || null, category_id || null,
    cost_price || 0, selling_price || 0, quantity || 0, reorder_level ?? 5, req.params.id
  );
  res.json({ ok: true });
});

// Restock (add units) — keeps a simple audit via updated quantity
router.post('/:id/restock', (req, res) => {
  const add = Number(req.body.quantity) || 0;
  db.prepare('UPDATE products SET quantity = quantity + ? WHERE id = ?').run(add, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
