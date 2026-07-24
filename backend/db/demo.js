// db/demo.js
// Fills a DEMO instance with realistic sample data so visitors immediately see
// a working shop: products with barcodes, suppliers, purchases, sales (cash /
// card / credit), expenses, and an opening cash float.
//
// Only ever runs when the database is empty, so it can never overwrite anything.

import db from './database.js';
import crypto from 'crypto';

const DEMO_USER = 'demo';
const DEMO_PASS = 'demo1234';

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

export function seedDemo() {
  const hasProducts = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  const hasUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (hasProducts > 0 || hasUsers > 0) return false; // never touch existing data

  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysAgo = (n) => {
    const d = new Date(now); d.setDate(d.getDate() - n);
    return iso(d < firstOfMonth ? firstOfMonth : d);
  };

  db.transaction(() => {
    // --- demo accounts -------------------------------------------------
    const owner = hashPassword(DEMO_PASS);
    db.prepare(`INSERT INTO users (username, password_hash, password_salt, role, can_delete, can_discount)
                VALUES (?, ?, ?, 'owner', 1, 1)`).run(DEMO_USER, owner.hash, owner.salt);
    const staff = hashPassword('staff1234');
    db.prepare(`INSERT INTO users (username, password_hash, password_salt, role, can_delete, can_discount)
                VALUES (?, ?, ?, 'staff', 0, 0)`).run('staff', staff.hash, staff.salt);

    // --- categories & products (with barcodes) --------------------------
    const cats = ['Groceries', 'Beverages', 'Snacks', 'Household', 'Personal Care'];
    const insCat = db.prepare('INSERT INTO categories (name) VALUES (?)');
    const catId = {};
    cats.forEach((c) => { catId[c] = insCat.run(c).lastInsertRowid; });

    // [name, sku, barcode, category, cost, sell, qty, reorder]
    // Stock is generous because the demo simulates a full month of trading.
    const products = [
      ['Rice 5kg',         'GR-001', '8901001001', 'Groceries',     900, 1150, 700, 40],
      ['Cooking Oil 1L',   'GR-002', '8901001002', 'Groceries',     420,  520, 600, 40],
      ['Sugar 1kg',        'GR-003', '8901001003', 'Groceries',     130,  165, 500, 40],
      ['Tea 500g',         'GR-004', '8901001004', 'Groceries',     560,  720, 450, 30],
      ['Cola 1.5L',        'BV-001', '8901002001', 'Beverages',     120,  170, 800, 60],
      ['Mineral Water 1L', 'BV-002', '8901002002', 'Beverages',      40,   70, 900, 80],
      ['Juice 1L',         'BV-003', '8901002003', 'Beverages',      95,  140, 600, 45],
      ['Potato Chips',     'SN-001', '8901003001', 'Snacks',         45,   80, 850, 70],
      ['Biscuits Pack',    'SN-002', '8901003002', 'Snacks',         60,   95, 700, 55],
      ['Chocolate Bar',    'SN-003', '8901003003', 'Snacks',         55,   90, 750, 55],
      ['Dish Soap',        'HH-001', '8901004001', 'Household',     140,  195, 420, 30],
      ['Detergent 1kg',    'HH-002', '8901004002', 'Household',     260,  340, 380, 30],
      ['Shampoo 200ml',    'PC-001', '8901005001', 'Personal Care', 180,  260, 320, 25],
      ['Toothpaste',       'PC-002', '8901005002', 'Personal Care',  95,  150, 300, 25],
      ['Soap Bar',         'PC-003', '8901005003', 'Personal Care',  40,   70, 650, 45],
    ];
    const insProd = db.prepare(`INSERT INTO products
      (name, sku, barcode, category_id, cost_price, selling_price, quantity, reorder_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const pid = {};
    products.forEach(([name, sku, bc, cat, cost, sell, qty, re]) => {
      pid[sku] = insProd.run(name, sku, bc, catId[cat], cost, sell, qty, re).lastInsertRowid;
    });

    // --- suppliers -------------------------------------------------------
    const insSup = db.prepare('INSERT INTO suppliers (name, phone, notes) VALUES (?, ?, ?)');
    const sup1 = insSup.run('Metro Distributors', '0300-1234567', 'Groceries & beverages').lastInsertRowid;
    const sup2 = insSup.run('Sunrise Foods', '0321-7654321', 'Snacks supplier').lastInsertRowid;

    // --- purchases (one paid cash, one on credit => a payable) -----------
    const insPur = db.prepare(`INSERT INTO purchases
      (invoice_no, supplier_id, date, payment_type, subtotal, discount, total, amount_paid, amount_due, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insPurItem = db.prepare(`INSERT INTO purchase_items
      (purchase_id, product_id, product_name, quantity, unit_cost, line_total)
      VALUES (?, ?, ?, ?, ?, ?)`);

    const p1Total = 20 * 900 + 30 * 120; // rice + cola
    const p1 = insPur.run('PUR-DEMO-1', sup1, daysAgo(12), 'cash', p1Total, 0, p1Total, p1Total, 0, 'Monthly restock').lastInsertRowid;
    insPurItem.run(p1, pid['GR-001'], 'Rice 5kg', 20, 900, 20 * 900);
    insPurItem.run(p1, pid['BV-001'], 'Cola 1.5L', 30, 120, 30 * 120);

    const p2Total = 40 * 45 + 25 * 60; // chips + biscuits
    const p2 = insPur.run('PUR-DEMO-2', sup2, daysAgo(5), 'credit', p2Total, 0, p2Total, 1000, p2Total - 1000, 'Snacks order').lastInsertRowid;
    insPurItem.run(p2, pid['SN-001'], 'Potato Chips', 40, 45, 40 * 45);
    insPurItem.run(p2, pid['SN-002'], 'Biscuits Pack', 25, 60, 25 * 60);

    // --- sales: a spread of cash / card / credit over recent days --------
    const insSale = db.prepare(`INSERT INTO sales
      (invoice_no, date, payment_type, customer_name, subtotal, discount, total, amount_paid, amount_due)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insItem = db.prepare(`INSERT INTO sale_items
      (sale_id, product_id, product_name, quantity, unit_price, unit_cost, line_discount, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insPay = db.prepare('INSERT INTO payments (sale_id, amount, method, note) VALUES (?, ?, ?, ?)');

    // Build a realistic month of trading: several sales a day, mostly cash,
    // some card, a few on credit. Deterministic (no randomness) so the demo
    // always looks the same.
    const skus = products.map((p) => p[1]);
    const customers = ['Ali Traders', 'Hassan Store', 'Bilal Kiryana', 'Noor General Store'];
    const sales = [];
    let seed = 7;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };

    // Track remaining stock while generating, so the demo can never sell more
    // than it has (which would show negative quantities).
    const stockLeft = {};
    products.forEach(([n, sku, bc, cat, cost, sell, qty]) => { stockLeft[sku] = qty; });

    for (let ago = 27; ago >= 0; ago--) {
      const salesToday = 6 + rnd(6);           // 6–11 sales a day
      for (let s = 0; s < salesToday; s++) {
        const lineCount = 1 + rnd(3);          // 1–3 different items
        const lines = [];
        for (let l = 0; l < lineCount; l++) {
          const sku = skus[rnd(skus.length)];
          if (lines.some((x) => x[0] === sku)) continue;
          let qty = 2 + rnd(6);
          // never oversell: leave a little stock on the shelf
          const available = Math.max(0, stockLeft[sku] - 12);
          qty = Math.min(qty, available);
          if (qty <= 0) continue;
          stockLeft[sku] -= qty;
          const disc = rnd(10) === 0 ? 20 : 0; // occasional discount
          lines.push([sku, qty, disc]);
        }
        if (!lines.length) continue;
        const r = rnd(10);
        if (r === 0) {
          sales.push([ago, 'credit', customers[rnd(customers.length)], lines, rnd(2) ? 500 : 0]);
        } else if (r <= 2) {
          sales.push([ago, 'card', null, lines]);
        } else {
          sales.push([ago, 'cash', null, lines]);
        }
      }
    }

    const prodBySku = {};
    products.forEach(([name, sku, bc, cat, cost, sell]) => { prodBySku[sku] = { name, cost, sell, id: pid[sku] }; });

    sales.forEach(([ago, payType, customer, lines, paidNow], i) => {
      let subtotal = 0, discTotal = 0;
      const prepared = lines.map(([sku, qty, disc]) => {
        const p = prodBySku[sku];
        subtotal += p.sell * qty; discTotal += disc;
        return { ...p, qty, disc, lineTotal: p.sell * qty - disc };
      });
      const total = subtotal - discTotal;
      const paid = payType === 'credit' ? (paidNow || 0) : total;
      const due = Math.max(0, total - paid);
      const saleId = insSale.run(`INV-DEMO-${i + 1}`, daysAgo(ago), payType, customer, subtotal, discTotal, total, paid, due).lastInsertRowid;
      prepared.forEach((it) => {
        insItem.run(saleId, it.id, it.name, it.qty, it.sell, it.cost, it.disc, it.lineTotal);
        db.prepare('UPDATE products SET quantity = quantity - ? WHERE id = ?').run(it.qty, it.id);
      });
      if (payType === 'credit' && paid > 0) insPay.run(saleId, paid, 'cash', 'Initial payment at sale');
    });

    // --- expenses --------------------------------------------------------
    const insExp = db.prepare('INSERT INTO expenses (date, category, amount, description, payment_method) VALUES (?, ?, ?, ?, ?)');
    insExp.run(daysAgo(20), 'Rent', 25000, 'Shop rent', 'bank');
    insExp.run(daysAgo(20), 'Salaries', 18000, 'Staff salary', 'cash');
    insExp.run(daysAgo(12), 'Utilities', 6200, 'Electricity bill', 'cash');
    insExp.run(daysAgo(6),  'Transport', 2400, 'Delivery van fuel', 'cash');
    insExp.run(daysAgo(2),  'Packaging', 1800, 'Bags and wrapping', 'cash');

    // --- opening cash float ---------------------------------------------
    db.prepare('INSERT INTO cash_adjustments (date, amount, reason) VALUES (?, ?, ?)')
      .run(daysAgo(28), 150000, 'Opening cash float');

    // Leave a few items genuinely low so the "needs reordering" warning shows.
    const setLow = db.prepare('UPDATE products SET quantity = ? WHERE id = ?');
    setLow.run(6, pid['PC-002']);   // Toothpaste
    setLow.run(9, pid['GR-003']);   // Sugar 1kg
    setLow.run(14, pid['HH-002']);  // Detergent 1kg
  })();

  return true;
}

export const DEMO_CREDENTIALS = { username: DEMO_USER, password: DEMO_PASS };
