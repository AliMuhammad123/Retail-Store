# Retail Manager

A professional, server-based retail management app for shop owners. It replaces
manual bookkeeping with digital entries and automatic calculations — inventory,
sales, revenue, profit & loss, expenses, and credit tracking, all linked together
in one dashboard.

Built to run on your own computer. No internet or cloud account required after
the one-time install (it even works fully offline). It can also be **put online**
so you can use it from any device on any network — see `DEPLOY.md`.

> **Sign-in & roles:** The first time you open the app it asks you to create the
> **owner** account. The owner has full rights and sees a **Staff** tab for adding
> logins. Staff can record sales and add stock/expenses, but **cannot delete
> anything** unless the owner switches on "Can delete" for them. Every username
> must be unique, so an owner login and a staff login can never clash — signing in
> always lands you in the correct account. This keeps your shop private and
> controlled, especially if you host it online.

---

## What it does

- **Inventory** — track every item with its **cost price** and **selling price**,
  quantity on hand, and category. See totals per category and for the whole shop,
  plus the potential profit locked in your stock. Low-stock items are flagged
  automatically.
- **Sales (point of sale)** — ring up a sale by picking products into a cart.
  Choose **cash, card, or credit**, apply a discount, and take partial payments.
  Stock is decremented automatically and the item's cost is snapshotted so your
  profit figures stay accurate even if prices change later.
- **Revenue & Profit / Loss** — every sale records revenue and cost of goods sold
  (COGS). The dashboard and reports compute **gross profit, expenses, and net
  profit or loss** for any day, month, or custom range.
- **Expenses** — log expenses by category (rent, salaries, utilities, etc.) and
  see the full breakdown. Expenses flow straight into your profit & loss.
- **Credit sales** — when a customer buys on credit, the outstanding balance is
  tracked. Record repayments over time and watch total receivables go down.
- **Dashboard** — KPIs and charts: revenue & profit trend, cash vs credit split,
  inventory value by category, and expense breakdown.
- **Reports** — a proper Profit & Loss statement and a top-products-by-profit list.

Everything is connected: a single sale updates inventory, revenue, profit, and
(if on credit) receivables at the same time.

### Also included

- **Suppliers & purchasing** — add the companies you buy from, record purchases
  (paid by cash, card, or credit), which automatically increase your stock and
  update cost prices. Each purchase gets its own **invoice**, and every supplier
  has a running **ledger** showing what you've bought and what you still owe
  (payables).
- **Cash in hand** — the app tracks the physical cash in your drawer: cash sales
  and credit repayments come in; cash purchases, supplier payments, and cash
  expenses go out. A dedicated Cash screen shows the running balance and every
  movement, and you can add an opening float or record a withdrawal.
- **Individual invoices** — every sale produces a printable invoice; so does
  every purchase.
- **Search everywhere** — products (by name, SKU, barcode, or category), sales,
  expenses, suppliers, and purchases all have search.
- **Discounts** — give a per-item discount at checkout. This is an owner right;
  the owner can grant it to specific staff from the Staff tab.
- **Barcodes for large inventories** — give products a barcode, then at checkout
  just scan (or type the code and press Enter) to add them to the cart instantly.
  Inventory search also matches barcodes, so big catalogues stay manageable.
- **Store summary** — the dashboard opens with a plain-language read on how your
  store is doing: profit or loss, cash in hand, what customers owe you, what you
  owe suppliers, and which items are low on stock.

---

## Easiest way to run (Windows — click and go, no black window)

You only need to install **Node.js** once. After that, the app opens like a normal
program — just a browser window, no command prompt.

### 1. Install Node.js (one time)

- Go to <https://nodejs.org> and download the **LTS** installer for Windows.
- Run it and accept the defaults.

### 2. Double-click **`Start Retail Manager (no window).vbs`**

That's it. It lives in the main `retail-manager` folder. The first time, it shows
a short setup window that finishes on its own (about a minute). Every time after,
it quietly starts the app in the background and **opens your shop in the browser
automatically** — no console window at all.

- To use it again later, just double-click the same file. If it's already
  running, it simply reopens the shop in your browser.
- **To stop it** (optional — you can leave it running all day), double-click
  **`Stop Retail Manager.vbs`**.

> **Important — closing the browser does NOT stop the app.** The app has two
> parts: a background server (no window) and the browser page (your view). Closing
> the browser only closes the view; the server keeps running in the background so
> your phone and other devices can still reach it. To actually shut it down, use
> **`Stop Retail Manager.vbs`**.

> **Installing an update?** Because the old version keeps running in the
> background, replacing the files isn't enough on its own. After copying in the new
> version, double-click **`Restart Retail Manager.vbs`** — it stops the old
> background copy and starts the new one — then hard-refresh your browser with
> **Ctrl + F5**.

### 3. Make it feel like a real installed app (optional but nice)

Put an icon on your desktop or taskbar:

1. Right-click **`Start Retail Manager (no window).vbs`** →
   **Send to** → **Desktop (create shortcut)**.
2. On the desktop, right-click the new shortcut → **Rename** → call it
   **"My Shop"** (or anything you like).
3. Right-click it again → **Properties** → **Change Icon…** → **Browse**, then
   pick **`retail-manager.ico`** from the project folder → **OK** → **OK**.
4. Now you have a proper app icon you can double-click any time. You can also
   right-click it and choose **Pin to Start** or **Pin to taskbar**.

> The black-window version, **`Start Retail Manager.bat`**, is still included. Use
> it only if something isn't working and you want to see the messages —
> otherwise the no-window launcher is the one to use.

---

## Running it manually (optional / Mac / troubleshooting)

If you prefer the terminal, or you're on a Mac, you can run it by hand instead.

1. Install Node.js 22.5+ from <https://nodejs.org> (LTS).
2. Open a terminal and go into the backend folder, e.g.
   `cd Desktop/retail-manager/backend`
3. Install libraries (one time): `npm install`
4. Start the app: `npm start`
5. Open <http://localhost:4000> in your browser.

To stop it, press `Ctrl + C`. To run it again later, just repeat step 4.

> **Note:** The app uses a fast database engine (`better-sqlite3`) when it can be
> installed on your machine, and automatically falls back to Node's built-in
> database if not. Either way it just works — you don't have to do anything.

---

## Everyday use

- **Selling something?** Go to **New Sale**, tap the products, pick cash/card/credit,
  and check out.
- **Got new stock?** Go to **Inventory** → **Restock** on the item, or **Add
  Product** for something new.
- **Paid a bill?** Go to **Expenses** → **Add Expense**.
- **Customer paying off credit?** Go to **Credit** → **Receive Payment**.
- **Want the numbers?** The **Dashboard** and **Reports** update automatically.

---

## Changing the currency

The app shows amounts in `Rs` by default. To change it, open
`frontend/app.js` in any text editor, and edit the line near the top:

```js
const CURRENCY = 'Rs'; // change to '$', '₹', '€', etc. to suit your shop
```

Save the file and refresh the browser.

---

## Your data & backups

All your data lives in a single file: `backend/db/retail.db`. To **back up** your
shop, just copy that file somewhere safe (a USB drive, cloud folder, etc.). To
**restore**, put the file back. To **start over from scratch**, delete it and
restart the app.

---

## How it's built (for the curious / your developer)

A single Node.js server does everything — it stores the data and serves the
web interface — so there's nothing else to run.

```
retail-manager/
├── backend/
│   ├── server.js            Express server; serves the API and the web app
│   ├── db/
│   │   ├── driver.js        Auto-selects the database engine
│   │   ├── database.js      Opens the DB, creates the tables
│   │   └── seed.js          Optional sample data
│   └── routes/              The API: categories, products, sales,
│                            expenses, dashboard, reports
└── frontend/
    ├── index.html           The app shell
    ├── styles.css           Styling
    ├── app.js               The whole interface (no build step needed)
    └── vendor/chart.umd.js  Charting library (bundled for offline use)
```

- **Backend:** Node.js + Express, with a SQLite database (a single local file).
  No external database server to install.
- **Frontend:** a lightweight single-page app in plain JavaScript — no build
  tools, no framework install. The same server serves it.
- **Money math is done carefully:** each sale line stores the item's cost *at the
  time of sale*, so historical profit stays correct even after you change prices.

### The API (if you want to integrate or extend)

| Area       | Endpoint (prefix `/api`)                         |
|------------|--------------------------------------------------|
| Categories | `/categories`                                    |
| Products   | `/products`, `/products/inventory/summary`, `/products/:id/restock` |
| Sales      | `/sales`, `/sales/:id/payment`, `/sales/credit/outstanding` |
| Expenses   | `/expenses`, `/expenses/breakdown`               |
| Dashboard  | `/dashboard`                                      |
| Reports    | `/reports/pnl`, `/reports/timeseries`, `/reports/top-products` |

Most list endpoints accept `?from=YYYY-MM-DD&to=YYYY-MM-DD` and default to the
current month.

---

## Troubleshooting

- **"node is not recognized" / "command not found"** — Node.js isn't installed or
  the terminal was opened before installing it. Install Node (step 1) and open a
  fresh terminal.
- **Port already in use** — something else is using port 4000. Close it, or change
  the port by setting it before starting: on Mac/Linux `PORT=4100 npm start`, on
  Windows PowerShell `$env:PORT=4100; npm start`, then open the matching address.
- **Want to move the app to another computer** — copy the whole folder (you can
  skip `node_modules`; just run `npm install` again on the new machine). Bring
  `backend/db/retail.db` along to keep your data.
