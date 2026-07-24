// server.js
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';

import './db/database.js'; // initialize schema on boot
import { seedDemo } from './db/demo.js';
import auth, { requireAuth, requireDelete } from './routes/auth.js';
import categories from './routes/categories.js';
import products from './routes/products.js';
import sales from './routes/sales.js';
import expenses from './routes/expenses.js';
import dashboard from './routes/dashboard.js';
import reports from './routes/reports.js';
import suppliers from './routes/suppliers.js';
import purchases from './routes/purchases.js';
import cash from './routes/cash.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// In DEMO_MODE the app fills itself with sample data on first boot so visitors
// see a working shop straight away. Never runs if the database already has data.
if (process.env.DEMO_MODE === '1') {
  try { if (seedDemo()) console.log('Demo data seeded.'); } catch (e) { console.error('Demo seed failed:', e.message); }
}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Login / setup routes are public; user management inside is owner-only.
app.use('/api/auth', auth);

// Everything below requires a signed-in user.
app.use('/api', requireAuth);
// Any delete action is blocked unless you're the owner or a staff member the
// owner has granted delete rights to.
app.use('/api', (req, res, next) => (req.method === 'DELETE' ? requireDelete(req, res, next) : next()));

// API routes
app.use('/api/categories', categories);
app.use('/api/products', products);
app.use('/api/sales', sales);
app.use('/api/expenses', expenses);
app.use('/api/dashboard', dashboard);
app.use('/api/reports', reports);
app.use('/api/suppliers', suppliers);
app.use('/api/purchases', purchases);
app.use('/api/cash', cash);

// Serve the frontend (plain static SPA — no build step required)
const clientDir = join(__dirname, '..', 'frontend');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
  // SPA fallback for any non-API route
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(join(clientDir, 'index.html')));
}

// Find this computer's network (Wi-Fi/LAN) addresses so phones and other
// devices on the same network know what to connect to.
function lanAddresses() {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address);
    }
  }
  return addrs;
}

function openBrowser() {
  const url = `http://localhost:${PORT}`;
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {}); // ignore any error; user can still open the URL manually
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Retail Manager is running.\n`);
  console.log(`  On this computer:   http://localhost:${PORT}`);
  const lan = lanAddresses();
  if (lan.length) {
    console.log(`\n  On your phone or other devices (same Wi-Fi):`);
    for (const ip of lan) console.log(`      http://${ip}:${PORT}`);
  }
  console.log(`\n  Keep this window open while using the app. Press Ctrl + C to stop.\n`);

  // When started by the double-click launcher, open the app in the browser
  // automatically (exactly when the server is ready).
  if (process.env.OPEN_BROWSER === '1') openBrowser();
});

// If the app is already running (someone clicked the launcher again), don't
// crash with a scary error — just open the browser to the running shop and exit.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    if (process.env.OPEN_BROWSER === '1') openBrowser();
    process.exit(0);
  }
  throw err;
});
