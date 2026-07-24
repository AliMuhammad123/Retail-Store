// routes/dashboard.js
import { Router } from 'express';
import db from '../db/database.js';
import { rangeFromQuery } from './_range.js';

const router = Router();

function periodStats(from, to) {
  const sales = db.prepare(`
    SELECT COALESCE(SUM(total),0) AS revenue,
           COALESCE(SUM(CASE WHEN payment_type='credit' THEN total ELSE 0 END),0) AS credit_sales,
           COALESCE(SUM(CASE WHEN payment_type='cash'   THEN total ELSE 0 END),0) AS cash_sales,
           COALESCE(SUM(CASE WHEN payment_type='card'   THEN total ELSE 0 END),0) AS card_sales,
           COUNT(*) AS order_count
    FROM sales WHERE date BETWEEN ? AND ?
  `).get(from, to);

  const cogs = db.prepare(`
    SELECT COALESCE(SUM(si.unit_cost * si.quantity),0) AS cogs
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
    WHERE s.date BETWEEN ? AND ?
  `).get(from, to).cogs;

  const expenses = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE date BETWEEN ? AND ?`
  ).get(from, to).total;

  const grossProfit = sales.revenue - cogs;
  const netProfit = grossProfit - expenses;

  return {
    revenue: sales.revenue, cogs, gross_profit: grossProfit, expenses,
    net_profit: netProfit, is_loss: netProfit < 0,
    credit_sales: sales.credit_sales, cash_sales: sales.cash_sales, card_sales: sales.card_sales,
    order_count: sales.order_count,
    gross_margin_pct: sales.revenue ? (grossProfit / sales.revenue) * 100 : 0,
    net_margin_pct: sales.revenue ? (netProfit / sales.revenue) * 100 : 0,
  };
}

function cashOnHand() {
  const q = (sql) => db.prepare(sql).get().v;
  const inflow =
    q(`SELECT COALESCE(SUM(amount_paid),0) v FROM sales WHERE payment_type='cash'`) +
    q(`SELECT COALESCE(SUM(amount),0) v FROM payments WHERE method='cash'`) +
    q(`SELECT COALESCE(SUM(amount),0) v FROM cash_adjustments WHERE amount>0`);
  const outflow =
    q(`SELECT COALESCE(SUM(amount_paid),0) v FROM purchases WHERE payment_type IN ('cash','credit')`) +
    q(`SELECT COALESCE(SUM(amount),0) v FROM supplier_payments WHERE method='cash'`) +
    q(`SELECT COALESCE(SUM(amount),0) v FROM expenses WHERE payment_method='cash'`) +
    q(`SELECT COALESCE(-SUM(amount),0) v FROM cash_adjustments WHERE amount<0`);
  return inflow - outflow;
}

function buildSummary(period, receivables, payables, inventory, cash, topProduct, currency) {
  const money = (n) => `${currency} ${Math.round(n).toLocaleString()}`;
  const bits = [];
  if (period.order_count === 0) {
    bits.push('No sales recorded in this period yet. Once you start ringing up sales, your profit, cash, and trends will appear here.');
  } else {
    const profitWord = period.is_loss ? 'a loss' : 'a profit';
    bits.push(`You made ${period.order_count} sale${period.order_count === 1 ? '' : 's'} totalling ${money(period.revenue)}, for ${profitWord} of ${money(Math.abs(period.net_profit))} after costs and expenses (${period.net_margin_pct.toFixed(0)}% margin).`);
    if (period.is_loss) bits.push(`Expenses (${money(period.expenses)}) are eating into your gross profit of ${money(period.gross_profit)} — worth reviewing where the money is going.`);
  }
  if (topProduct) bits.push(`Your best earner is ${topProduct.name}, bringing in ${money(topProduct.profit)} profit.`);
  if (cash != null) bits.push(`You have about ${money(cash)} cash in hand.`);
  if (receivables.due > 0) bits.push(`Customers owe you ${money(receivables.due)} across ${receivables.count} unpaid invoice${receivables.count === 1 ? '' : 's'}.`);
  if (payables.total_payable > 0) bits.push(`You owe suppliers ${money(payables.total_payable)}.`);
  if (inventory.low_stock_count > 0) bits.push(`${inventory.low_stock_count} item${inventory.low_stock_count === 1 ? ' is' : 's are'} low on stock and may need reordering.`);
  return bits.join(' ');
}

router.get('/', (req, res) => {
  const { from, to } = rangeFromQuery(req);
  const currency = req.query.currency || 'Rs';
  const period = periodStats(from, to);
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = periodStats(`${todayStr} 00:00:00`, `${todayStr} 23:59:59`);

  const receivables = db.prepare('SELECT COALESCE(SUM(amount_due),0) AS due, COUNT(*) AS count FROM sales WHERE amount_due > 0').get();
  const payables = db.prepare('SELECT COALESCE(SUM(amount_due),0) AS total_payable, COUNT(*) AS count FROM purchases WHERE amount_due > 0').get();
  const inventory = db.prepare(`
    SELECT COALESCE(SUM(quantity*cost_price),0) AS cost_value,
           COALESCE(SUM(quantity*selling_price),0) AS retail_value,
           COUNT(*) AS products,
           SUM(CASE WHEN quantity <= reorder_level THEN 1 ELSE 0 END) AS low_stock_count
    FROM products`).get();
  const cash = cashOnHand();
  const topProduct = db.prepare(`
    SELECT si.product_name AS name,
           SUM((si.unit_price - si.unit_cost) * si.quantity - si.line_discount) AS profit
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
    WHERE s.date BETWEEN ? AND ?
    GROUP BY si.product_name ORDER BY profit DESC LIMIT 1`).get(from, to);

  const summary = buildSummary(period, receivables, payables, inventory, cash, topProduct, currency);
  res.json({ range: { from, to }, period, today, receivables, payables, inventory, cash_on_hand: cash, summary });
});

export default router;
