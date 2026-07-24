# Sharing a public demo link (for LinkedIn or sending to people)

This guide puts a **demo version** of your app online at a web address you can
post publicly, e.g. `https://retail-manager-demo.onrender.com`.

---

## Read this first — two important points

**1. Never publish your real shop.** Anything you post on LinkedIn can be opened
by anyone. Share a **demo** filled with sample data, and keep your real shop on
your own PC (or a separate private link). This project supports a built-in demo
mode exactly for that.

**2. Visitors need a way in.** Your app has a login screen. In demo mode, the
login screen shows a green **"Enter demo →"** button so anyone can walk straight
in with one click (the demo username and password are also displayed). Without
this, visitors would hit a password prompt and leave.

---

## What demo mode does

Set one setting (`DEMO_MODE=1`) and, on first start with an empty database, the
app fills itself with a realistic sample shop:

- 15 products across 5 categories, **all with barcodes** (so scanning can be tried)
- 2 suppliers, plus purchases — one paid cash, one on credit (so payables show)
- ~230 sales spread over the last month: cash, card, and credit, some discounted
- Expenses (rent, salaries, utilities, transport, packaging)
- An opening cash float

The result is a shop showing roughly **Rs 500,000 revenue and about Rs 75,000
profit**, with money owed by customers, money owed to a supplier, live charts,
and a few low-stock items — so every feature has something to show.

Two demo logins are created:

| Login | Password | What it shows |
|-------|----------|----------------|
| `demo` | `demo1234` | **Owner** — full access, sees the Staff tab, can delete and discount |
| `staff` | `staff1234` | **Staff** — no Staff tab, cannot delete or discount |

Suggest that visitors try both, to see the permissions system in action.

> Demo mode **never** overwrites data. If the database already has anything in
> it, seeding is skipped entirely.

---

## Publishing it free on Render

Render's free tier is a good fit for a demo. No credit card is required.

**Honest limitations of the free tier:** <a name="free"></a>
- The service **sleeps after about 15 minutes of inactivity**, and the next
  visitor waits roughly **30–60 seconds** for it to wake up. Fine for a demo,
  and worth mentioning in your post (e.g. "may take a moment to wake up").
- Free storage is **not permanent** — when the service restarts, the database
  resets. For a demo this is actually a *benefit*: it wipes whatever visitors
  typed and restores the clean sample shop.
- Free usage is capped at 750 hours a month, which is enough for one service.

### Steps

1. **Put the project on GitHub.** Create a free account at <https://github.com>,
   make a new repository (e.g. `retail-manager`), and upload this whole folder.
   GitHub's website has an "Add file → Upload files" button — no commands needed.
2. **Create a Render account** at <https://render.com> and connect your GitHub.
3. Click **New → Web Service** and select your repository. Render detects the
   included `Dockerfile` automatically.
4. Choose the **Free** instance type.
5. Under **Environment**, add these variables:
   - `DEMO_MODE` = `1`
   - `NODE_ENV` = `production`
   - `DB_PATH` = `/tmp/retail.db`
   *(On the free tier use `/tmp`. If you later upgrade to a paid plan with a
   persistent disk mounted at `/data`, change this to `/data/retail.db`.)*
6. Click **Create Web Service** and wait a few minutes for the build.
7. Render gives you a public address like `https://your-name.onrender.com`.
   **Open it — you should see the login screen with the green "Enter demo →"
   button.** That's your shareable link.

---

## A LinkedIn post you could adapt

> I built a complete retail shop management system for small shop owners —
> inventory, point of sale with barcode scanning, purchasing and supplier
> ledgers, credit tracking, cash-in-hand, and profit & loss reporting.
>
> It replaces manual register bookkeeping: you record a sale once and inventory,
> revenue, profit, cash, and receivables all update automatically.
>
> Try the live demo (click "Enter demo"): <your link>
> Sign in as an owner or as staff to see the permission controls.
>
> (It's a free demo server, so it may take up to a minute to wake up.)

Add 2–3 screenshots — the Dashboard, the New Sale screen, and the Reports page
tend to be the most convincing.

---

## Keeping your real shop separate

Your real shop keeps running on your PC exactly as before — double-click
`Start Retail Manager (no window).vbs`. It is completely separate from the demo:
different computer, different database, different accounts. Nothing a visitor
does to the demo can touch your real data.

If you later want your *real* shop online (private, always-on, data kept safely),
that's the paid setup described in `DEPLOY.md` — around $7–8/month.
