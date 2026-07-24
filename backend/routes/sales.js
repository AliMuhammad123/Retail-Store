// routes/sales.js
import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// Record a sale.
// Body: { customer_name?, payment_type, discount?, amount_paid?, date?,
//         items: [{ product_id, quantity, unit_price? }] }
router.post('/', (req, res) => {
  const { customer_name, payment_type = 'cash', discount = 0, items = [], date } = req.body;
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'At least one item is required' });

  const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');

  try {
    const result = db.transaction(() => {
      let subtotal = 0;
      let lineDiscountTotal = 0;
      const prepared = [];

      for (const line of items) {
        const p = getProduct.get(line.product_id);
        if (!p) throw new Error(`Product ${line.product_id} not found`);
        const qty = Number(line.quantity);
        if (!qty || qty <= 0) throw new Error(`Invalid quantity for ${p.name}`);
        if (qty > p.quantity) throw new Error(`Not enough stock for ${p.name} (have ${p.quantity}, need ${qty})`);

        const unitPrice = line.unit_price != null ? Number(line.unit_price) : p.selling_price;
        const lineDiscount = Math.max(0, Number(line.line_discount || 0));
        const lineTotal = Math.max(0, unitPrice * qty - lineDiscount);
        subtotal += unitPrice * qty;
        lineDiscountTotal += lineDiscount;
        prepared.push({
          product_id: p.id, product_name: p.name, quantity: qty,
          unit_price: unitPrice, unit_cost: p.cost_price, line_discount: lineDiscount, line_total: lineTotal,
        });
      }

      // Total discount = per-item discounts + any overall discount on the sale.
      const orderDiscount = Number(discount || 0);
      const totalDiscount = lineDiscountTotal + orderDiscount;
      const total = Math.max(0, subtotal - totalDiscount);

      // Payment logic: credit sales default to 0 paid unless amount_paid given.
      let amountPaid;
      if (payment_type === 'credit') amountPaid = Number(req.body.amount_paid || 0);
      else amountPaid = total; // cash / card fully paid
      const amountDue = Math.max(0, total - amountPaid);

      const saleDate = date || new Date().toISOString().slice(0, 19).replace('T', ' ');
      const invoiceNo = 'INV-' + Date.now();

      const saleInfo = db.prepare(`INSERT INTO sales
        (invoice_no, date, payment_type, customer_name, subtotal, discount, total, amount_paid, amount_due)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        invoiceNo, saleDate, payment_type, customer_name || null,
        subtotal, totalDiscount, total, amountPaid, amountDue
      );
      const saleId = saleInfo.lastInsertRowid;

      const insItem = db.prepare(`INSERT INTO sale_items
        (sale_id, product_id, product_name, quantity, unit_price, unit_cost, line_discount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      const decStock = db.prepare('UPDATE products SET quantity = quantity - ? WHERE id = ?');

      for (const it of prepared) {
        insItem.run(saleId, it.product_id, it.product_name, it.quantity, it.unit_price, it.unit_cost, it.line_discount, it.line_total);
        decStock.run(it.quantity, it.product_id);
      }

      // If a partial payment was made on a credit sale, log it (with method) too.
      if (payment_type === 'credit' && amountPaid > 0) {
        db.prepare('INSERT INTO payments (sale_id, amount, method, note) VALUES (?, ?, ?, ?)')
          .run(saleId, amountPaid, req.body.paid_method || 'cash', 'Initial payment at sale');
      }

      return { id: saleId, invoice_no: invoiceNo, total, amount_paid: amountPaid, amount_due: amountDue };
    })();

    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// List recent sales (optional ?q= search on invoice or customer)
router.get('/', (req, res) => {
  const limit = Number(req.query.limit) || 100;
  const q = (req.query.q || '').trim();
  const where = q ? `WHERE s.invoice_no LIKE @like OR s.customer_name LIKE @like` : '';
  const rows = db.prepare(`
    SELECT s.*,
      (SELECT COALESCE(SUM(quantity),0) FROM sale_items WHERE sale_id = s.id) AS item_count,
      (SELECT COALESCE(SUM(si.unit_cost * si.quantity),0) FROM sale_items si WHERE si.sale_id = s.id) AS cogs,
      s.total - (SELECT COALESCE(SUM(si.unit_cost * si.quantity),0) FROM sale_items si WHERE si.sale_id = s.id) AS profit
    FROM sales s ${where} ORDER BY s.date DESC LIMIT @limit
  `).all(q ? { like: `%${q}%`, limit } : { limit });
  res.json(rows);
});

// Single sale with line items
router.get('/:id', (req, res) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Not found' });
  sale.items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(req.params.id);
  sale.payments = db.prepare('SELECT * FROM payments WHERE sale_id = ? ORDER BY date').all(req.params.id);
  res.json(sale);
});

// Outstanding credit (receivables) — grouped by customer
router.get('/credit/outstanding', (req, res) => {
  const list = db.prepare(`
    SELECT id, invoice_no, date, customer_name, total, amount_paid, amount_due
    FROM sales WHERE amount_due > 0 ORDER BY date ASC
  `).all();
  const total = list.reduce((s, r) => s + r.amount_due, 0);
  res.json({ total_outstanding: total, count: list.length, list });
});

// Record a repayment against a credit sale
router.post('/:id/payment', (req, res) => {
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Sale not found' });

  db.transaction(() => {
    const pay = Math.min(amount, sale.amount_due);
    db.prepare('UPDATE sales SET amount_paid = amount_paid + ?, amount_due = amount_due - ? WHERE id = ?')
      .run(pay, pay, sale.id);
    db.prepare('INSERT INTO payments (sale_id, amount, method, note) VALUES (?, ?, ?, ?)')
      .run(sale.id, pay, req.body.method || 'cash', req.body.note || 'Repayment');
  })();

  res.json({ ok: true });
});

export default router;
