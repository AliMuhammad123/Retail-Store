// routes/cash.js
// Tracks physical CASH in the drawer. Card/bank money is deliberately excluded
// because it doesn't sit in the till.
//
//  Cash IN  = cash sales + cash received against credit + cash added (float)
//  Cash OUT = cash purchases + cash paid to suppliers + cash expenses + cash removed
import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

function breakdown() {
  const cashSalesIn = db.prepare(
    `SELECT COALESCE(SUM(amount_paid),0) AS v FROM sales WHERE payment_type='cash'`
  ).get().v;
  const cashRepayIn = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS v FROM payments WHERE method='cash'`
  ).get().v;
  const adjIn = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS v FROM cash_adjustments WHERE amount > 0`
  ).get().v;

  const cashPurchOut = db.prepare(
    `SELECT COALESCE(SUM(amount_paid),0) AS v FROM purchases WHERE payment_type IN ('cash','credit')`
  ).get().v;
  const supplierPayOut = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS v FROM supplier_payments WHERE method='cash'`
  ).get().v;
  const cashExpOut = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE payment_method='cash'`
  ).get().v;
  const adjOut = db.prepare(
    `SELECT COALESCE(-SUM(amount),0) AS v FROM cash_adjustments WHERE amount < 0`
  ).get().v;

  const totalIn = cashSalesIn + cashRepayIn + adjIn;
  const totalOut = cashPurchOut + supplierPayOut + cashExpOut + adjOut;
  return {
    cash_sales_in: cashSalesIn,
    cash_repayments_in: cashRepayIn,
    cash_added_in: adjIn,
    cash_purchases_out: cashPurchOut,
    supplier_payments_out: supplierPayOut,
    cash_expenses_out: cashExpOut,
    cash_removed_out: adjOut,
    total_in: totalIn,
    total_out: totalOut,
    cash_on_hand: totalIn - totalOut,
  };
}

router.get('/on-hand', (req, res) => res.json(breakdown()));

// Full chronological cash ledger with running balance
router.get('/ledger', (req, res) => {
  const rows = [];
  db.prepare(`SELECT date, amount_paid AS amt, invoice_no FROM sales WHERE payment_type='cash' AND amount_paid>0`)
    .all().forEach((r) => rows.push({ date: r.date, label: `Cash sale ${r.invoice_no || ''}`.trim(), in: r.amt, out: 0 }));
  db.prepare(`SELECT p.date, p.amount AS amt, s.invoice_no FROM payments p JOIN sales s ON s.id=p.sale_id WHERE p.method='cash'`)
    .all().forEach((r) => rows.push({ date: r.date, label: `Cash received ${r.invoice_no || ''}`.trim(), in: r.amt, out: 0 }));
  db.prepare(`SELECT date, amount_paid AS amt, invoice_no FROM purchases WHERE payment_type IN ('cash','credit') AND amount_paid>0`)
    .all().forEach((r) => rows.push({ date: r.date, label: `Cash paid on purchase ${r.invoice_no || ''}`.trim(), in: 0, out: r.amt }));
  db.prepare(`SELECT sp.date, sp.amount AS amt, s.name FROM supplier_payments sp LEFT JOIN suppliers s ON s.id=sp.supplier_id WHERE sp.method='cash'`)
    .all().forEach((r) => rows.push({ date: r.date, label: `Paid supplier ${r.name || ''}`.trim(), in: 0, out: r.amt }));
  db.prepare(`SELECT date, amount AS amt, category, description FROM expenses WHERE payment_method='cash'`)
    .all().forEach((r) => rows.push({ date: r.date, label: `Expense: ${r.category}${r.description ? ' — ' + r.description : ''}`, in: 0, out: r.amt }));
  db.prepare(`SELECT date, amount AS amt, reason FROM cash_adjustments`)
    .all().forEach((r) => rows.push({ date: r.date, label: r.reason || 'Cash adjustment', in: r.amt > 0 ? r.amt : 0, out: r.amt < 0 ? -r.amt : 0 }));

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let bal = 0;
  for (const r of rows) { bal += r.in - r.out; r.balance = bal; }
  res.json({ ledger: rows.reverse(), cash_on_hand: bal });
});

// Add or remove cash manually (opening float, owner withdrawal, correction)
router.post('/adjust', (req, res) => {
  const amount = Number(req.body.amount);
  if (!amount || Number.isNaN(amount)) return res.status(400).json({ error: 'Enter a non-zero amount' });
  db.prepare('INSERT INTO cash_adjustments (amount, reason) VALUES (?, ?)')
    .run(amount, req.body.reason || (amount > 0 ? 'Cash added' : 'Cash removed'));
  res.json({ ok: true });
});

export default router;
