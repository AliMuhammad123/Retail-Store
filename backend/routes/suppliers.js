// routes/suppliers.js
import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// List suppliers (optional ?q=) with how much the store still owes each (payable)
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  const where = q ? `WHERE s.name LIKE @like OR s.phone LIKE @like` : '';
  const rows = db.prepare(`
    SELECT s.*,
      (SELECT COALESCE(SUM(amount_due),0) FROM purchases WHERE supplier_id = s.id) AS payable,
      (SELECT COALESCE(SUM(total),0)      FROM purchases WHERE supplier_id = s.id) AS total_purchased
    FROM suppliers s ${where} ORDER BY s.name
  `).all(q ? { like: `%${q}%` } : {});
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, phone, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Supplier name is required' });
  const info = db.prepare('INSERT INTO suppliers (name, phone, notes) VALUES (?, ?, ?)')
    .run(name.trim(), phone || null, notes || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, phone, notes } = req.body;
  db.prepare('UPDATE suppliers SET name=?, phone=?, notes=? WHERE id=?')
    .run(name, phone || null, notes || null, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// All money the store owes suppliers (accounts payable)
router.get('/payables/outstanding', (req, res) => {
  const list = db.prepare(`
    SELECT s.id, s.name, s.phone,
           COALESCE(SUM(p.amount_due),0) AS payable
    FROM suppliers s JOIN purchases p ON p.supplier_id = s.id
    WHERE p.amount_due > 0
    GROUP BY s.id ORDER BY payable DESC
  `).all();
  const total = list.reduce((a, r) => a + r.payable, 0);
  res.json({ total_payable: total, count: list.length, list });
});

// Supplier ledger: purchases (debit) and payments (credit), with running balance
router.get('/:id/ledger', (req, res) => {
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  const purchases = db.prepare(
    `SELECT id, date, invoice_no, total, amount_paid, amount_due FROM purchases WHERE supplier_id = ?`
  ).all(req.params.id);
  const payments = db.prepare(
    `SELECT id, date, amount, method, note FROM supplier_payments WHERE supplier_id = ?`
  ).all(req.params.id);

  // Build a combined, date-sorted ledger. Purchases increase what we owe;
  // payments reduce it. (Initial payment at purchase time is inside amount_paid.)
  const entries = [];
  for (const p of purchases) {
    entries.push({ date: p.date, type: 'purchase', ref: p.invoice_no, debit: p.total, credit: 0, purchase_id: p.id });
    if (p.amount_paid > 0) {
      entries.push({ date: p.date, type: 'payment', ref: p.invoice_no, debit: 0, credit: p.amount_paid, note: 'Paid at purchase' });
    }
  }
  for (const pay of payments) {
    entries.push({ date: pay.date, type: 'payment', ref: pay.note || 'Payment', debit: 0, credit: pay.amount, method: pay.method });
  }
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let balance = 0;
  for (const e of entries) { balance += e.debit - e.credit; e.balance = balance; }

  res.json({ supplier, entries, payable: balance });
});

// Record a payment to a supplier (reduces oldest unpaid purchases first)
router.post('/:id/payment', (req, res) => {
  const amount = Number(req.body.amount);
  const method = req.body.method || 'cash';
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  db.transaction(() => {
    let remaining = amount;
    const dues = db.prepare('SELECT * FROM purchases WHERE supplier_id = ? AND amount_due > 0 ORDER BY date ASC')
      .all(req.params.id);
    for (const d of dues) {
      if (remaining <= 0) break;
      const pay = Math.min(remaining, d.amount_due);
      // Only reduce what is still owed. We intentionally do NOT change amount_paid
      // (which stays as the payment made at purchase time), so the supplier ledger
      // — which counts the initial payment plus each supplier_payments row — never
      // double-counts. Payable is always SUM(amount_due).
      db.prepare('UPDATE purchases SET amount_due = amount_due - ? WHERE id = ?').run(pay, d.id);
      remaining -= pay;
    }
    db.prepare('INSERT INTO supplier_payments (supplier_id, amount, method, note) VALUES (?, ?, ?, ?)')
      .run(req.params.id, amount, method, req.body.note || 'Payment to supplier');
  })();

  res.json({ ok: true });
});

export default router;
