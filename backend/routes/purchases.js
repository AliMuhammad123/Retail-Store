// routes/purchases.js
// Records stock coming IN from a supplier. Increases inventory quantity,
// updates each product's cost price to the latest purchase cost, and tracks
// how it was paid (cash / card / credit). Credit purchases create a payable.
import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// Create a purchase.
// Body: { supplier_id?, payment_type, discount?, amount_paid?, note?, date?,
//         items: [{ product_id, quantity, unit_cost }] }
router.post('/', (req, res) => {
  const { supplier_id, payment_type = 'cash', discount = 0, items = [], note, date } = req.body;
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'At least one item is required' });

  const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');

  try {
    const result = db.transaction(() => {
      let subtotal = 0;
      const prepared = [];
      for (const line of items) {
        const p = getProduct.get(line.product_id);
        if (!p) throw new Error(`Product ${line.product_id} not found`);
        const qty = Number(line.quantity);
        const cost = Number(line.unit_cost);
        if (!qty || qty <= 0) throw new Error(`Invalid quantity for ${p.name}`);
        if (cost < 0 || Number.isNaN(cost)) throw new Error(`Invalid cost for ${p.name}`);
        const lineTotal = qty * cost;
        subtotal += lineTotal;
        prepared.push({ product_id: p.id, product_name: p.name, quantity: qty, unit_cost: cost, line_total: lineTotal });
      }

      const total = Math.max(0, subtotal - Number(discount || 0));
      let amountPaid = payment_type === 'credit' ? Number(req.body.amount_paid || 0) : total;
      const amountDue = Math.max(0, total - amountPaid);

      const purchaseDate = date || new Date().toISOString().slice(0, 19).replace('T', ' ');
      const invoiceNo = 'PUR-' + Date.now();

      const info = db.prepare(`INSERT INTO purchases
        (invoice_no, supplier_id, date, payment_type, subtotal, discount, total, amount_paid, amount_due, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        invoiceNo, supplier_id || null, purchaseDate, payment_type,
        subtotal, discount || 0, total, amountPaid, amountDue, note || null
      );
      const purchaseId = info.lastInsertRowid;

      const insItem = db.prepare(`INSERT INTO purchase_items
        (purchase_id, product_id, product_name, quantity, unit_cost, line_total)
        VALUES (?, ?, ?, ?, ?, ?)`);
      // Increase stock and refresh the product's cost price to the latest paid cost.
      const restock = db.prepare('UPDATE products SET quantity = quantity + ?, cost_price = ? WHERE id = ?');

      for (const it of prepared) {
        insItem.run(purchaseId, it.product_id, it.product_name, it.quantity, it.unit_cost, it.line_total);
        restock.run(it.quantity, it.unit_cost, it.product_id);
      }

      return { id: purchaseId, invoice_no: invoiceNo, total, amount_paid: amountPaid, amount_due: amountDue };
    })();

    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// List purchases (optional ?q= search on invoice or supplier)
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  const where = q ? `WHERE p.invoice_no LIKE @like OR s.name LIKE @like` : '';
  const rows = db.prepare(`
    SELECT p.*, s.name AS supplier_name,
      (SELECT COALESCE(SUM(quantity),0) FROM purchase_items WHERE purchase_id = p.id) AS item_count
    FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
    ${where} ORDER BY p.date DESC LIMIT 200
  `).all(q ? { like: `%${q}%` } : {});
  res.json(rows);
});

// Single purchase with items (the invoice)
router.get('/:id', (req, res) => {
  const purchase = db.prepare(`
    SELECT p.*, s.name AS supplier_name, s.phone AS supplier_phone
    FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?
  `).get(req.params.id);
  if (!purchase) return res.status(404).json({ error: 'Not found' });
  purchase.items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(req.params.id);
  res.json(purchase);
});

export default router;
