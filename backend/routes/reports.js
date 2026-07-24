// routes/reports.js
import { Router } from 'express';
import db from '../db/database.js';
import { rangeFromQuery } from './_range.js';

const router = Router();

// Profit & Loss statement for a period
router.get('/pnl', (req, res) => {
  const { from, to } = rangeFromQuery(req);

  const revenue = db.prepare(
    `SELECT COALESCE(SUM(total),0) AS v FROM sales WHERE date BETWEEN ? AND ?`
  ).get(from, to).v;

  const cogs = db.prepare(`
    SELECT COALESCE(SUM(si.unit_cost*si.quantity),0) AS v
    FROM sale_items si JOIN sales s ON s.id=si.sale_id
    WHERE s.date BETWEEN ? AND ?
  `).get(from, to).v;

  const expenseRows = db.prepare(`
    SELECT category, SUM(amount) AS total FROM expenses
    WHERE date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC
  `).all(from, to);
  const expensesTotal = expenseRows.reduce((s, r) => s + r.total, 0);

  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expensesTotal;

  // How sales were paid, so the report shows cash takings clearly
  const byPayment = db.prepare(`
    SELECT payment_type, COALESCE(SUM(total),0) AS total, COUNT(*) AS count
    FROM sales WHERE date BETWEEN ? AND ? GROUP BY payment_type
  `).all(from, to);
  const pay = { cash: 0, card: 0, credit: 0 };
  byPayment.forEach((r) => { pay[r.payment_type] = r.total; });

  res.json({
    range: { from, to },
    revenue,
    cogs,
    gross_profit: grossProfit,
    expenses_total: expensesTotal,
    expenses_by_category: expenseRows,
    net_profit: netProfit,
    is_loss: netProfit < 0,
    sales_by_payment: pay,
  });
});

// Time series: daily or monthly revenue / profit / expenses
router.get('/timeseries', (req, res) => {
  const { from, to } = rangeFromQuery(req);
  const groupBy = req.query.group === 'month' ? '%Y-%m' : '%Y-%m-%d';

  const sales = db.prepare(`
    SELECT strftime('${groupBy}', s.date) AS bucket,
           SUM(s.total) AS revenue,
           SUM((SELECT COALESCE(SUM(si.unit_cost*si.quantity),0) FROM sale_items si WHERE si.sale_id=s.id)) AS cogs
    FROM sales s WHERE s.date BETWEEN ? AND ?
    GROUP BY bucket ORDER BY bucket
  `).all(from, to);

  const exp = db.prepare(`
    SELECT strftime('${groupBy}', date) AS bucket, SUM(amount) AS expenses
    FROM expenses WHERE date BETWEEN ? AND ? GROUP BY bucket
  `).all(from, to);

  const expMap = Object.fromEntries(exp.map((e) => [e.bucket, e.expenses]));
  const series = sales.map((s) => {
    const expenses = expMap[s.bucket] || 0;
    const grossProfit = s.revenue - s.cogs;
    return {
      bucket: s.bucket,
      revenue: s.revenue,
      cogs: s.cogs,
      gross_profit: grossProfit,
      expenses,
      net_profit: grossProfit - expenses,
    };
  });
  res.json(series);
});

// Best sellers by revenue and by profit
router.get('/top-products', (req, res) => {
  const { from, to } = rangeFromQuery(req);
  const rows = db.prepare(`
    SELECT si.product_name,
           SUM(si.quantity) AS units_sold,
           SUM(si.line_total) AS revenue,
           SUM((si.unit_price - si.unit_cost) * si.quantity) AS profit
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
    WHERE s.date BETWEEN ? AND ?
    GROUP BY si.product_name ORDER BY revenue DESC LIMIT 10
  `).all(from, to);
  res.json(rows);
});

export default router;
