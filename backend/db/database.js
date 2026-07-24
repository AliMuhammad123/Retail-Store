// db/database.js
// Central SQLite connection + schema. Uses better-sqlite3 when available,
// otherwise Node's built-in node:sqlite (see driver.js).
//
// Everything is linked by foreign keys so the modules stay consistent:
//   categories 1-* products 1-* sale_items *-1 sales 1-* payments
//   expenses stand alone but feed into Profit & Loss.

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { openDatabase } from './driver.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// DB_PATH can be overridden with an environment variable so that when the app
// is hosted online, the data file can live on the host's permanent disk.
const DB_PATH = process.env.DB_PATH || join(__dirname, 'retail.db');

// Make sure the folder for the database file exists (e.g. a mounted /data disk).
fs.mkdirSync(dirname(DB_PATH), { recursive: true });

const db = await openDatabase(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  sku            TEXT UNIQUE,
  category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  cost_price     REAL NOT NULL DEFAULT 0,
  selling_price  REAL NOT NULL DEFAULT 0,
  quantity       REAL NOT NULL DEFAULT 0,
  reorder_level  REAL NOT NULL DEFAULT 5,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no    TEXT UNIQUE,
  date          TEXT NOT NULL DEFAULT (datetime('now')),
  payment_type  TEXT NOT NULL DEFAULT 'cash',
  customer_name TEXT,
  subtotal      REAL NOT NULL DEFAULT 0,
  discount      REAL NOT NULL DEFAULT 0,
  total         REAL NOT NULL DEFAULT 0,
  amount_paid   REAL NOT NULL DEFAULT 0,
  amount_due    REAL NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sale_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id      INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity     REAL NOT NULL,
  unit_price   REAL NOT NULL,
  unit_cost    REAL NOT NULL,
  line_total   REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id   INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  date      TEXT NOT NULL DEFAULT (datetime('now')),
  amount    REAL NOT NULL,
  note      TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT NOT NULL DEFAULT (datetime('now')),
  category    TEXT NOT NULL DEFAULT 'General',
  amount      REAL NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sales_date      ON sales(date);
CREATE INDEX IF NOT EXISTS idx_expenses_date   ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_products_cat    ON products(category_id);

-- User accounts that can log into the shop (owner + any staff).
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'owner',
  can_delete    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Small key/value store for app secrets (e.g. the session signing key).
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Suppliers / companies the store buys stock from.
CREATE TABLE IF NOT EXISTS suppliers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  phone       TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Purchases (stock coming IN from a supplier). Mirrors sales but inbound.
CREATE TABLE IF NOT EXISTS purchases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no    TEXT UNIQUE,
  supplier_id   INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  date          TEXT NOT NULL DEFAULT (datetime('now')),
  payment_type  TEXT NOT NULL DEFAULT 'cash',   -- cash | card | credit
  subtotal      REAL NOT NULL DEFAULT 0,
  discount      REAL NOT NULL DEFAULT 0,
  total         REAL NOT NULL DEFAULT 0,
  amount_paid   REAL NOT NULL DEFAULT 0,
  amount_due    REAL NOT NULL DEFAULT 0,          -- what the store still owes (payable)
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id  INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity     REAL NOT NULL,
  unit_cost    REAL NOT NULL,
  line_total   REAL NOT NULL
);

-- Payments the store makes to suppliers (money OUT against payables).
CREATE TABLE IF NOT EXISTS supplier_payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id  INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  purchase_id  INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
  date         TEXT NOT NULL DEFAULT (datetime('now')),
  amount       REAL NOT NULL,
  method       TEXT NOT NULL DEFAULT 'cash',      -- cash | card | bank
  note         TEXT
);

-- Manual cash drawer adjustments (opening float, owner withdrawals, etc.).
CREATE TABLE IF NOT EXISTS cash_adjustments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT NOT NULL DEFAULT (datetime('now')),
  amount      REAL NOT NULL,                       -- positive = cash in, negative = cash out
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_purchases_date  ON purchases(date);
CREATE INDEX IF NOT EXISTS idx_purchase_items  ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_supplier_pay    ON supplier_payments(supplier_id);
`);

// --- lightweight migrations: add columns to older databases that lack them ---
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}
ensureColumn('users', 'can_delete', 'can_delete INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'can_discount', 'can_discount INTEGER NOT NULL DEFAULT 0');
ensureColumn('products', 'barcode', 'barcode TEXT');
ensureColumn('payments', 'method', "method TEXT NOT NULL DEFAULT 'cash'");
ensureColumn('expenses', 'payment_method', "payment_method TEXT NOT NULL DEFAULT 'cash'");
ensureColumn('sale_items', 'line_discount', 'line_discount REAL NOT NULL DEFAULT 0');

export default db;
