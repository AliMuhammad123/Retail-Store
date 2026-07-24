// db/seed.js
// Populates sample data ONLY if the database is empty. Safe to run repeatedly.

import db from './database.js';

const count = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
if (count > 0) {
  console.log('Database already has data — skipping seed.');
  process.exit(0);
}

const seed = db.transaction(() => {
  // Categories
  const cats = ['Groceries', 'Beverages', 'Snacks', 'Household', 'Personal Care'];
  const insCat = db.prepare('INSERT INTO categories (name) VALUES (?)');
  const catId = {};
  cats.forEach((c) => { catId[c] = insCat.run(c).lastInsertRowid; });

  // Products: [name, sku, category, cost, sell, qty, reorder]
  const products = [
    ['Rice 5kg',        'GR-001', 'Groceries',      900, 1150, 40, 10],
    ['Cooking Oil 1L',  'GR-002', 'Groceries',      420,  520, 25, 10],
    ['Sugar 1kg',       'GR-003', 'Groceries',      130,  165, 8,  10],
    ['Cola 1.5L',       'BV-001', 'Beverages',      120,  170, 60, 15],
    ['Mineral Water 1L','BV-002', 'Beverages',       40,   70, 100,20],
    ['Potato Chips',    'SN-001', 'Snacks',          45,   80, 70, 20],
    ['Biscuits Pack',   'SN-002', 'Snacks',          60,   95, 5,  15],
    ['Dish Soap',       'HH-001', 'Household',      140,  195, 30, 10],
    ['Detergent 1kg',   'HH-002', 'Household',      260,  340, 18, 10],
    ['Shampoo 200ml',   'PC-001', 'Personal Care',  180,  260, 22, 8],
    ['Toothpaste',      'PC-002', 'Personal Care',   95,  150, 3,  8],
  ];
  const insProd = db.prepare(`INSERT INTO products
    (name, sku, category_id, cost_price, selling_price, quantity, reorder_level)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const prodId = {};
  products.forEach(([name, sku, cat, cost, sell, qty, re]) => {
    prodId[sku] = insProd.run(name, sku, catId[cat], cost, sell, qty, re).lastInsertRowid;
  });

  // A few sample expenses across this month
  const insExp = db.prepare(`INSERT INTO expenses (date, category, amount, description) VALUES (?, ?, ?, ?)`);
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const iso = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  // Place demo expenses within the CURRENT month so the default view always shows them.
  const inMonth = (n) => {
    const d = new Date(today); d.setDate(d.getDate() - n);
    return iso(d < firstOfMonth ? firstOfMonth : d);
  };
  insExp.run(inMonth(20), 'Rent',      35000, 'Monthly shop rent');
  insExp.run(inMonth(18), 'Salaries',  22000, 'Staff salary');
  insExp.run(inMonth(10), 'Utilities', 6500,  'Electricity bill');
  insExp.run(inMonth(4),  'Utilities', 1800,  'Water bill');
  insExp.run(inMonth(2),  'Transport', 2400,  'Delivery van fuel');

  console.log('Seeded categories, products, and expenses.');
});

seed();
console.log('Seed complete.');
