/* ------------------------------------------------------------------ *
 * Retail Manager — front-end SPA (vanilla JS, no build step)
 * Talks to the Express API on the same origin (/api/...).
 * ------------------------------------------------------------------ */

const CURRENCY = 'Rs'; // change to '$', '₹', '€', etc. to suit your shop

/* ---------- tiny helpers ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const money = (n) => `${CURRENCY} ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pct = (n) => `${Number(n || 0).toFixed(1)}%`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/auth')) {
    // session missing or expired — send them back to the login screen
    showAuthScreen();
    throw new Error(data.error || 'Please sign in');
  }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg, type = 'ok') {
  const t = el(`<div class="toast ${type}">${esc(msg)}</div>`);
  $('#toast-root').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 2600);
}

/* ---------- period range ---------- */
function currentRange() {
  const p = state.period;
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const start = new Date(now);
  if (p === 'today') return { from: iso(now), to: iso(now) };
  if (p === '7d') { start.setDate(now.getDate() - 6); return { from: iso(start), to: iso(now) }; }
  if (p === '30d') { start.setDate(now.getDate() - 29); return { from: iso(start), to: iso(now) }; }
  if (p === 'year') return { from: `${now.getFullYear()}-01-01`, to: iso(now) };
  // month (default)
  return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: iso(now) };
}
const rangeQS = () => { const r = currentRange(); return `from=${r.from}&to=${r.to}`; };

/* ---------- modal ---------- */
function modal({ title, body, footer }) {
  const root = $('#modal-root');
  const overlay = el(`<div class="modal-overlay"><div class="modal">
    <div class="modal-head">${esc(title)}</div>
    <div class="modal-body"></div>
    <div class="modal-foot"></div></div></div>`);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const close = () => { root.innerHTML = ''; };
  $('.modal-body', overlay).appendChild(typeof body === 'string' ? el(`<div>${body}</div>`) : body);
  (footer || []).forEach((b) => $('.modal-foot', overlay).appendChild(b));
  root.innerHTML = ''; root.appendChild(overlay);
  return { close };
}
function btn(text, cls, onClick) { const b = el(`<button class="btn ${cls || ''}">${esc(text)}</button>`); b.onclick = onClick; return b; }

/* ---------- state & router ---------- */
const state = { period: 'month', route: 'dashboard' };
let currentUser = null; // { id, username, role, can_delete }
const isOwner = () => currentUser && currentUser.role === 'owner';
const canDelete = () => currentUser && (currentUser.role === 'owner' || currentUser.can_delete);
const canDiscount = () => currentUser && (currentUser.role === 'owner' || currentUser.can_discount);
let chartRefs = [];
function clearCharts() { chartRefs.forEach((c) => c.destroy()); chartRefs = []; }

const ROUTES = [
  { id: 'dashboard', label: 'Dashboard', ico: '📊', render: renderDashboard },
  { id: 'sale',      label: 'New Sale',  ico: '🧾', render: renderSale },
  { id: 'inventory', label: 'Inventory', ico: '📦', render: renderInventory },
  { id: 'purchases', label: 'Purchases', ico: '📥', render: renderPurchases },
  { id: 'suppliers', label: 'Suppliers', ico: '🏭', render: renderSuppliers },
  { id: 'expenses',  label: 'Expenses',  ico: '💸', render: renderExpenses },
  { id: 'cash',      label: 'Cash in Hand', ico: '💰', render: renderCash },
  { id: 'reports',   label: 'Reports',   ico: '📈', render: renderReports },
  { id: 'credit',    label: 'Credit / Receivables', ico: '🤝', render: renderCredit },
  { id: 'staff',     label: 'Staff', ico: '👥', render: renderStaff, ownerOnly: true },
];

// Routes visible to the current user (Staff tab is owner-only).
const visibleRoutes = () => ROUTES.filter((r) => !r.ownerOnly || isOwner());

function buildNav() {
  const nav = $('#nav');
  nav.innerHTML = '';
  visibleRoutes().forEach((r) => {
    const b = el(`<button class="nav-item ${state.route === r.id ? 'active' : ''}">
      <span class="ico">${r.ico}</span><span>${r.label}</span></button>`);
    b.onclick = () => go(r.id);
    nav.appendChild(b);
  });
}

async function go(routeId) {
  let route = ROUTES.find((r) => r.id === routeId);
  // Guard: if a non-owner somehow targets an owner-only route, send them home.
  if (!route || (route.ownerOnly && !isOwner())) route = ROUTES[0];
  state.route = route.id;
  $('#page-title').textContent = route.label;
  $('#topbar-actions').innerHTML = '';
  buildNav();
  clearCharts();
  const view = $('#view');
  view.innerHTML = '<div class="empty">Loading…</div>';
  try { await route.render(view); }
  catch (e) { view.innerHTML = `<div class="empty">⚠️ ${esc(e.message)}</div>`; }
}

/* ================================================================== *
 * DASHBOARD
 * ================================================================== */
async function renderDashboard(view) {
  const d = await api(`/dashboard?${rangeQS()}&currency=${encodeURIComponent(CURRENCY)}`);
  const p = d.period, t = d.today;
  const netClass = p.is_loss ? 'neg' : 'pos';
  const netLabel = p.is_loss ? 'Net Loss' : 'Net Profit';

  view.innerHTML = '';
  view.appendChild(el(`
    <div class="summary-card">
      <div class="summary-ico">💡</div>
      <div>
        <div class="summary-title">How your store is doing</div>
        <div class="summary-text">${esc(d.summary)}</div>
      </div>
    </div>`));
  view.appendChild(el(`<div>
    <div class="kpi-grid">
      <div class="kpi">
        <div class="label">Revenue (period)</div>
        <div class="value">${money(p.revenue)}</div>
        <div class="sub">${p.order_count} orders · today ${money(t.revenue)}</div>
      </div>
      <div class="kpi">
        <div class="label">${netLabel}</div>
        <div class="value ${netClass}">${money(Math.abs(p.net_profit))}</div>
        <div class="sub">After ${money(p.expenses)} expenses · ${pct(p.net_margin_pct)}</div>
      </div>
      <div class="kpi">
        <div class="label">Cash in Hand</div>
        <div class="value ${d.cash_on_hand < 0 ? 'neg' : 'pos'}">${money(d.cash_on_hand)}</div>
        <div class="sub">Physical cash in your drawer</div>
      </div>
      <div class="kpi">
        <div class="label">Credit Outstanding</div>
        <div class="value">${money(d.receivables.due)}</div>
        <div class="sub">${d.receivables.count} customers owe you</div>
      </div>
      <div class="kpi">
        <div class="label">You Owe Suppliers</div>
        <div class="value ${d.payables.total_payable > 0 ? 'neg' : ''}">${money(d.payables.total_payable)}</div>
        <div class="sub">${d.payables.count} unpaid purchase${d.payables.count === 1 ? '' : 's'}</div>
      </div>
      <div class="kpi">
        <div class="label">Inventory Value (cost)</div>
        <div class="value">${money(d.inventory.cost_value)}</div>
        <div class="sub">${d.inventory.products} products · retail ${money(d.inventory.retail_value)}</div>
      </div>
      <div class="kpi">
        <div class="label">Gross Profit</div>
        <div class="value pos">${money(p.gross_profit)}</div>
        <div class="sub">Margin ${pct(p.gross_margin_pct)} · COGS ${money(p.cogs)}</div>
      </div>
      <div class="kpi">
        <div class="label">Low Stock Items</div>
        <div class="value ${d.inventory.low_stock_count > 0 ? 'neg' : ''}">${d.inventory.low_stock_count}</div>
        <div class="sub">${d.inventory.low_stock_count > 0 ? 'Need reordering soon' : 'All stock healthy'}</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <h3>Revenue vs Profit trend <span class="muted-h" id="trend-sub"></span></h3>
        <div class="chart-wrap"><canvas id="trendChart"></canvas></div>
      </div>
      <div class="panel">
        <h3>Cash vs Credit sales</h3>
        <div class="chart-wrap"><canvas id="splitChart"></canvas></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <h3>Inventory by category</h3>
        <div class="chart-wrap"><canvas id="catChart"></canvas></div>
      </div>
      <div class="panel">
        <h3>Expense breakdown</h3>
        <div class="chart-wrap"><canvas id="expChart"></canvas></div>
      </div>
    </div>
  </div>`));

  // --- trend chart ---
  const groupByMonth = ['year'].includes(state.period);
  const series = await api(`/reports/timeseries?${rangeQS()}&group=${groupByMonth ? 'month' : 'day'}`);
  $('#trend-sub').textContent = groupByMonth ? '(monthly)' : '(daily)';
  const labels = series.map((s) => s.bucket);
  chartRefs.push(new Chart($('#trendChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Revenue', data: series.map((s) => s.revenue), borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,.1)', fill: true, tension: .3 },
        { label: 'Net profit', data: series.map((s) => s.net_profit), borderColor: '#16a34a', tension: .3 },
      ],
    },
    options: chartOpts(),
  }));

  // --- cash vs credit ---
  chartRefs.push(new Chart($('#splitChart'), {
    type: 'doughnut',
    data: { labels: ['Cash / Card', 'Credit'], datasets: [{ data: [p.cash_sales, p.credit_sales], backgroundColor: ['#4f46e5', '#d97706'] }] },
    options: { ...chartOpts(), cutout: '62%' },
  }));

  // --- inventory by category ---
  const inv = await api('/products/inventory/summary');
  chartRefs.push(new Chart($('#catChart'), {
    type: 'bar',
    data: {
      labels: inv.byCategory.map((c) => c.category),
      datasets: [
        { label: 'Cost value', data: inv.byCategory.map((c) => c.cost_value), backgroundColor: '#818cf8' },
        { label: 'Retail value', data: inv.byCategory.map((c) => c.retail_value), backgroundColor: '#c4b5fd' },
      ],
    },
    options: chartOpts(),
  }));

  // --- expenses ---
  const exp = await api('/expenses/breakdown?' + rangeQS());
  if (exp.breakdown.length) {
    chartRefs.push(new Chart($('#expChart'), {
      type: 'doughnut',
      data: { labels: exp.breakdown.map((e) => e.category), datasets: [{ data: exp.breakdown.map((e) => e.total), backgroundColor: ['#4f46e5', '#d97706', '#16a34a', '#dc2626', '#0891b2', '#7c3aed', '#db2777'] }] },
      options: { ...chartOpts(), cutout: '55%' },
    }));
  } else {
    $('#expChart').parentElement.innerHTML = '<div class="empty">No expenses in this period</div>';
  }
}

function chartOpts() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } } },
    scales: undefined,
  };
}

/* ================================================================== *
 * NEW SALE (point of sale)
 * ================================================================== */
const cart = [];
async function renderSale(view) {
  let products = await api('/products');
  view.innerHTML = '';
  const wrap = el(`
    <div class="grid-2">
      <div class="panel">
        <h3>Choose products <span class="muted-h">tap to add</span></h3>
        <div class="scan-bar">
          <span class="scan-ico">📷</span>
          <input id="scanBox" placeholder="Scan barcode or type code, then Enter" autocomplete="off" />
        </div>
        <input id="prodSearch" placeholder="Search by name, SKU, barcode or category…" style="margin-bottom:14px" />
        <div class="product-pick" id="pickGrid"></div>
      </div>
      <div class="panel">
        <h3>Current sale</h3>
        <div id="cartBox"></div>
      </div>
    </div>`);
  view.appendChild(wrap);

  const grid = $('#pickGrid', wrap);
  let filterText = '';
  function drawGrid() {
    grid.innerHTML = '';
    const f = filterText.toLowerCase();
    const shown = products.filter((p) =>
      !f || p.name.toLowerCase().includes(f) ||
      (p.sku || '').toLowerCase().includes(f) ||
      (p.barcode || '').toLowerCase().includes(f) ||
      (p.category_name || '').toLowerCase().includes(f));
    if (!shown.length) { grid.innerHTML = '<div class="empty">No matching products</div>'; return; }
    shown.slice(0, 200).forEach((p) => {
      const disabled = p.quantity <= 0;
      const c = el(`<div class="pcard" style="${disabled ? 'opacity:.45;pointer-events:none' : ''}">
        <div class="pn">${esc(p.name)}</div>
        <div class="pp">${money(p.selling_price)}</div>
        <div class="pq">In stock: ${p.quantity}${p.low_stock ? ' ⚠️' : ''}</div>
      </div>`);
      c.onclick = () => addToCart(p);
      grid.appendChild(c);
    });
  }
  drawGrid();
  $('#prodSearch', wrap).oninput = (e) => { filterText = e.target.value; drawGrid(); };

  // --- barcode scanning: scanners type the code then send Enter ---
  const scan = $('#scanBox', wrap);
  scan.focus();
  scan.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const code = scan.value.trim();
    if (!code) return;
    // try local list first (fast), then server lookup
    let p = products.find((x) => x.barcode === code || x.sku === code);
    if (!p) {
      try { p = await api('/products/lookup?code=' + encodeURIComponent(code)); }
      catch { toast('No product with code ' + code, 'err'); scan.value = ''; return; }
    }
    addToCart(p);
    scan.value = '';
  });

  function addToCart(p) {
    const existing = cart.find((i) => i.product_id === p.id);
    const inStock = p.quantity;
    if (existing) {
      if (existing.quantity + 1 > inStock) return toast('Not enough stock', 'err');
      existing.quantity++;
    } else {
      if (inStock < 1) return toast('Out of stock', 'err');
      cart.push({ product_id: p.id, name: p.name, unit_price: p.selling_price, quantity: 1, stock: inStock, line_discount: 0 });
    }
    drawCart();
  }

  function drawCart() {
    const box = $('#cartBox', wrap);
    if (!cart.length) { box.innerHTML = '<div class="empty">No items yet. Scan, search, or tap products.</div>'; return; }
    box.innerHTML = '';
    const allowDiscount = canDiscount();
    cart.forEach((it, idx) => {
      const lineTotal = Math.max(0, it.unit_price * it.quantity - (it.line_discount || 0));
      const line = el(`<div class="cart-item">
        <div style="flex:1">
          <div style="font-weight:600">${esc(it.name)}</div>
          <div class="mini">${money(it.unit_price)} each${it.line_discount ? ` · −${money(it.line_discount)} disc` : ''} = <strong>${money(lineTotal)}</strong></div>
          ${allowDiscount ? `<div class="disc-row"><label class="mini">Discount:</label><input type="number" class="disc-input" value="${it.line_discount || 0}" min="0" /></div>` : ''}
        </div>
        <div class="stepper">
          <button data-a="dec">−</button><span>${it.quantity}</span><button data-a="inc">+</button>
          <button data-a="del" style="color:var(--red)">✕</button>
        </div></div>`);
      $('[data-a=inc]', line).onclick = () => { if (it.quantity + 1 > it.stock) return toast('Not enough stock', 'err'); it.quantity++; drawCart(); };
      $('[data-a=dec]', line).onclick = () => { it.quantity--; if (it.quantity <= 0) cart.splice(idx, 1); drawCart(); };
      $('[data-a=del]', line).onclick = () => { cart.splice(idx, 1); drawCart(); };
      if (allowDiscount) {
        const di = $('.disc-input', line);
        di.onchange = () => { it.line_discount = Math.max(0, Math.min(Number(di.value || 0), it.unit_price * it.quantity)); drawCart(); };
      }
      box.appendChild(line);
    });
    const total = cart.reduce((s, i) => s + Math.max(0, i.unit_price * i.quantity - (i.line_discount || 0)), 0);
    const totalDisc = cart.reduce((s, i) => s + (i.line_discount || 0), 0);
    const foot = el(`<div class="mt">
      ${totalDisc ? `<div class="pl-line"><span>Total discount</span><span class="neg">−${money(totalDisc)}</span></div>` : ''}
      <div class="pl-line total"><span>Total</span><span>${money(total)}</span></div>
      <div class="field mt"><label>Payment type</label>
        <select id="payType">
          <option value="cash">Cash</option><option value="card">Card</option><option value="credit">Credit (on account)</option>
        </select></div>
      <div id="creditFields" style="display:none">
        <div class="field"><label>Customer name</label><input id="custName" placeholder="e.g. Ali Traders" /></div>
        <div class="field"><label>Amount paid now (rest goes on credit)</label><input id="paidNow" type="number" value="0" /></div>
      </div>
      <button class="btn green" id="checkoutBtn" style="width:100%;padding:12px;margin-top:6px">Complete Sale · ${money(total)}</button>
    </div>`);
    box.appendChild(foot);
    $('#payType', box).onchange = (e) => { $('#creditFields', box).style.display = e.target.value === 'credit' ? 'block' : 'none'; };
    $('#checkoutBtn', box).onclick = () => checkout(total);
  }
  drawCart();

  async function checkout(total) {
    const payType = $('#payType', wrap).value;
    const allowDiscount = canDiscount();
    const payload = { payment_type: payType, items: cart.map((i) => ({
      product_id: i.product_id, quantity: i.quantity,
      unit_price: i.unit_price, line_discount: allowDiscount ? (i.line_discount || 0) : 0,
    })) };
    if (payType === 'credit') {
      payload.customer_name = $('#custName', wrap).value || 'Walk-in';
      payload.amount_paid = Number($('#paidNow', wrap).value || 0);
    }
    try {
      const r = await api('/sales', { method: 'POST', body: payload });
      toast(`Sale recorded · ${r.invoice_no}`, 'ok');
      cart.length = 0;
      viewSaleInvoice(r.id);   // show the individual invoice (printable)
      go('sale'); // refresh (updates stock)
    } catch (e) { toast(e.message, 'err'); }
  }
}

/* ================================================================== *
 * INVENTORY
 * ================================================================== */
async function renderInventory(view) {
  $('#topbar-actions').appendChild(btn('+ Add product', '', () => productForm()));
  const [inv, cats, products] = await Promise.all([
    api('/products/inventory/summary'), api('/categories'), api('/products'),
  ]);

  view.innerHTML = '';
  view.appendChild(el(`
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Total inventory (cost)</div><div class="value">${money(inv.totals.total_cost_value)}</div><div class="sub">${inv.totals.total_units} units · ${inv.totals.product_count} products</div></div>
      <div class="kpi"><div class="label">Retail value</div><div class="value">${money(inv.totals.total_retail_value)}</div><div class="sub">Potential profit ${money(inv.totals.potential_profit)}</div></div>
      <div class="kpi"><div class="label">Low stock</div><div class="value ${inv.lowStock.length ? 'neg' : ''}">${inv.lowStock.length}</div><div class="sub">at or below reorder level</div></div>
    </div>`));

  // category summary
  const catPanel = el(`<div class="panel mt"><h3>Category-wise inventory</h3>
    <table><thead><tr><th>Category</th><th class="num">Products</th><th class="num">Units</th><th class="num">Cost value</th><th class="num">Retail value</th></tr></thead><tbody></tbody></table></div>`);
  const cbody = $('tbody', catPanel);
  inv.byCategory.forEach((c) => cbody.appendChild(el(
    `<tr><td>${esc(c.category)}</td><td class="num">${c.product_count}</td><td class="num">${c.units}</td><td class="num">${money(c.cost_value)}</td><td class="num">${money(c.retail_value)}</td></tr>`)));
  view.appendChild(catPanel);

  // full product list (with search that scales to large inventories)
  const listPanel = el(`<div class="panel mt">
    <div class="panel-head-row"><h3>All products</h3>
      <input id="invSearch" class="search-inline" placeholder="🔍 Search name, SKU, barcode, category…" /></div>
    <table><thead><tr><th>Product</th><th>Category</th><th class="num">Cost</th><th class="num">Sell</th><th class="num">Margin</th><th class="num">Stock</th><th></th></tr></thead><tbody></tbody></table>
    <div class="list-note mini"></div></div>`);
  const pbody = $('tbody', listPanel);
  const note = $('.list-note', listPanel);

  function drawRows(items) {
    pbody.innerHTML = '';
    if (!items.length) { pbody.appendChild(el('<tr><td colspan="7" class="empty">No matching products</td></tr>')); note.textContent = ''; return; }
    items.slice(0, 300).forEach((p) => {
      const row = el(`<tr>
        <td><strong>${esc(p.name)}</strong>${p.sku || p.barcode ? `<div class="mini">${esc(p.sku || '')}${p.barcode ? ' · ▮ ' + esc(p.barcode) : ''}</div>` : ''}</td>
        <td>${esc(p.category_name || '—')}</td>
        <td class="num">${money(p.cost_price)}</td>
        <td class="num">${money(p.selling_price)}</td>
        <td class="num pos">${money(p.margin_per_unit)}</td>
        <td class="num">${p.quantity} ${p.low_stock ? '<span class="badge low">low</span>' : ''}</td>
        <td class="num"></td></tr>`);
      const actions = $('td:last-child', row);
      actions.appendChild(btn('Restock', 'ghost sm', () => restockForm(p)));
      const editB = btn('Edit', 'ghost sm', () => productForm(p, cats)); editB.style.marginLeft = '6px';
      actions.appendChild(editB);
      pbody.appendChild(row);
    });
    note.textContent = items.length > 300 ? `Showing first 300 of ${items.length}. Use search to narrow.` : `${items.length} product${items.length === 1 ? '' : 's'}`;
  }
  drawRows(products);

  let searchTimer;
  $('#invSearch', listPanel).oninput = (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    searchTimer = setTimeout(async () => {
      const rows = await api('/products' + (q ? '?q=' + encodeURIComponent(q) : ''));
      drawRows(rows);
    }, 220);
  };
  view.appendChild(listPanel);

  function productForm(prod) {
    const isEdit = !!prod;
    const catOpts = cats.map((c) => `<option value="${c.id}" ${prod && prod.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const body = el(`<div>
      <div class="field"><label>Product name</label><input id="f_name" value="${esc(prod?.name || '')}" /></div>
      <div class="row"><div class="field"><label>SKU (optional)</label><input id="f_sku" value="${esc(prod?.sku || '')}" /></div>
        <div class="field"><label>Category</label><select id="f_cat"><option value="">— none —</option>${catOpts}</select></div></div>
      <div class="field"><label>Barcode (optional — for scanning at checkout)</label><input id="f_barcode" value="${esc(prod?.barcode || '')}" placeholder="scan or type the product barcode" /></div>
      <div class="row"><div class="field"><label>Cost price</label><input id="f_cost" type="number" value="${prod?.cost_price ?? 0}" /></div>
        <div class="field"><label>Selling price</label><input id="f_sell" type="number" value="${prod?.selling_price ?? 0}" /></div></div>
      <div class="row"><div class="field"><label>Quantity in stock</label><input id="f_qty" type="number" value="${prod?.quantity ?? 0}" /></div>
        <div class="field"><label>Reorder level</label><input id="f_re" type="number" value="${prod?.reorder_level ?? 5}" /></div></div>
      <div class="field"><label>Category not listed? Add a new one</label><input id="f_newcat" placeholder="New category name (optional)" /></div>
    </div>`);
    const m = modal({
      title: isEdit ? 'Edit product' : 'Add product', body,
      footer: [
        btn('Cancel', 'ghost', () => m.close()),
        btn('Save', '', async () => {
          let categoryId = $('#f_cat', body).value || null;
          const newCat = $('#f_newcat', body).value.trim();
          if (newCat) { const c = await api('/categories', { method: 'POST', body: { name: newCat } }); categoryId = c.id; }
          const payload = {
            name: $('#f_name', body).value, sku: $('#f_sku', body).value || null,
            barcode: $('#f_barcode', body).value || null, category_id: categoryId,
            cost_price: Number($('#f_cost', body).value), selling_price: Number($('#f_sell', body).value),
            quantity: Number($('#f_qty', body).value), reorder_level: Number($('#f_re', body).value),
          };
          try {
            if (isEdit) await api('/products/' + prod.id, { method: 'PUT', body: payload });
            else await api('/products', { method: 'POST', body: payload });
            m.close(); toast('Product saved'); go('inventory');
          } catch (e) { toast(e.message, 'err'); }
        }),
      ],
    });
  }

  function restockForm(prod) {
    const body = el(`<div><p class="mini" style="margin-bottom:12px">Current stock of <strong>${esc(prod.name)}</strong>: ${prod.quantity}</p>
      <div class="field"><label>Add units</label><input id="r_qty" type="number" value="10" /></div></div>`);
    const m = modal({ title: 'Restock', body, footer: [
      btn('Cancel', 'ghost', () => m.close()),
      btn('Add stock', 'green', async () => {
        await api(`/products/${prod.id}/restock`, { method: 'POST', body: { quantity: Number($('#r_qty', body).value) } });
        m.close(); toast('Stock updated'); go('inventory');
      }),
    ] });
  }
}

/* ================================================================== *
 * EXPENSES
 * ================================================================== */
async function renderExpenses(view) {
  $('#topbar-actions').appendChild(btn('+ Add expense', '', () => expenseForm()));
  const [list, breakdown] = await Promise.all([
    api('/expenses?' + rangeQS()), api('/expenses/breakdown?' + rangeQS()),
  ]);

  view.innerHTML = '';
  view.appendChild(el(`
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Total expenses (period)</div><div class="value neg">${money(breakdown.total)}</div><div class="sub">${list.length} entries</div></div>
    </div>`));

  const grid = el('<div class="grid-2 mt"></div>');
  const chartPanel = el(`<div class="panel"><h3>Breakdown by category</h3><div class="chart-wrap"><canvas id="expBreak"></canvas></div></div>`);
  const tablePanel = el(`<div class="panel">
    <div class="panel-head-row"><h3>Expense entries</h3>
      <input id="expSearch" class="search-inline" placeholder="🔍 Search category or note…" /></div>
    <table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Paid by</th><th class="num">Amount</th><th></th></tr></thead><tbody></tbody></table></div>`);
  grid.appendChild(tablePanel); grid.appendChild(chartPanel);
  view.appendChild(grid);

  const tbody = $('tbody', tablePanel);
  function drawExp(items) {
    tbody.innerHTML = '';
    if (!items.length) { tbody.appendChild(el('<tr><td colspan="6" class="empty">No expenses found</td></tr>')); return; }
    items.forEach((x) => {
      const row = el(`<tr><td>${x.date.slice(0, 10)}</td><td><span class="badge card">${esc(x.category)}</span></td>
        <td>${esc(x.description || '—')}</td><td class="mini">${esc(x.payment_method || 'cash')}</td><td class="num neg">${money(x.amount)}</td><td class="num"></td></tr>`);
      if (canDelete()) {
        $('td:last-child', row).appendChild(btn('Delete', 'ghost sm', async () => {
          try { await api('/expenses/' + x.id, { method: 'DELETE' }); toast('Deleted'); go('expenses'); }
          catch (e) { toast(e.message, 'err'); }
        }));
      }
      tbody.appendChild(row);
    });
  }
  drawExp(list);
  let expTimer;
  $('#expSearch', tablePanel).oninput = (e) => {
    clearTimeout(expTimer);
    const q = e.target.value.trim();
    expTimer = setTimeout(async () => {
      const rows = await api('/expenses?' + rangeQS() + (q ? '&q=' + encodeURIComponent(q) : ''));
      drawExp(rows);
    }, 220);
  };

  if (breakdown.breakdown.length) {
    chartRefs.push(new Chart($('#expBreak', chartPanel), {
      type: 'doughnut',
      data: { labels: breakdown.breakdown.map((b) => b.category), datasets: [{ data: breakdown.breakdown.map((b) => b.total), backgroundColor: ['#4f46e5', '#d97706', '#16a34a', '#dc2626', '#0891b2', '#7c3aed', '#db2777'] }] },
      options: { ...chartOpts(), cutout: '55%' },
    }));
  } else { $('#expBreak', chartPanel).parentElement.innerHTML = '<div class="empty">Nothing to chart</div>'; }

  function expenseForm() {
    const cats = ['Rent', 'Salaries', 'Utilities', 'Transport', 'Supplies', 'Marketing', 'Maintenance', 'General'];
    const body = el(`<div>
      <div class="row"><div class="field"><label>Category</label><select id="e_cat">${cats.map((c) => `<option>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Amount</label><input id="e_amt" type="number" value="0" /></div></div>
      <div class="row"><div class="field"><label>Date</label><input id="e_date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
        <div class="field"><label>Paid by</label><select id="e_method"><option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank</option></select></div></div>
      <div class="field"><label>Description (optional)</label><input id="e_desc" /></div></div>`);
    const m = modal({ title: 'Add expense', body, footer: [
      btn('Cancel', 'ghost', () => m.close()),
      btn('Save', '', async () => {
        try {
          await api('/expenses', { method: 'POST', body: {
            category: $('#e_cat', body).value, amount: Number($('#e_amt', body).value),
            description: $('#e_desc', body).value, date: $('#e_date', body).value + ' 12:00:00',
            payment_method: $('#e_method', body).value,
          } });
          m.close(); toast('Expense added'); go('expenses');
        } catch (e) { toast(e.message, 'err'); }
      }),
    ] });
  }
}

/* ================================================================== *
 * REPORTS  (Profit & Loss + top products)
 * ================================================================== */
async function renderReports(view) {
  const [pnl, top] = await Promise.all([
    api('/reports/pnl?' + rangeQS()), api('/reports/top-products?' + rangeQS()),
  ]);
  const netClass = pnl.is_loss ? 'neg' : 'pos';

  view.innerHTML = '';
  const grid = el('<div class="grid-2 even"></div>');

  const pl = el(`<div class="panel"><h3>Profit &amp; Loss statement <span class="muted-h">${pnl.range.from.slice(0,10)} → ${pnl.range.to.slice(0,10)}</span></h3>
    <div class="pl-line"><span class="lbl">Revenue (sales)</span><span>${money(pnl.revenue)}</span></div>
    <div class="pl-line"><span class="lbl">− Cost of goods sold</span><span class="neg">${money(pnl.cogs)}</span></div>
    <div class="pl-line total"><span>Gross profit</span><span class="pos">${money(pnl.gross_profit)}</span></div>
    <div id="expLines"></div>
    <div class="pl-line"><span class="lbl">− Total expenses</span><span class="neg">${money(pnl.expenses_total)}</span></div>
    <div class="pl-line total"><span>${pnl.is_loss ? 'NET LOSS' : 'NET PROFIT'}</span><span class="${netClass}">${money(Math.abs(pnl.net_profit))}</span></div>
    <div style="margin-top:14px;padding-top:10px;border-top:1px dashed #e5e7eb">
      <div class="mini" style="margin-bottom:6px;font-weight:600">How sales were paid</div>
      <div class="pl-line"><span class="lbl">Cash</span><span class="pos">${money(pnl.sales_by_payment.cash)}</span></div>
      <div class="pl-line"><span class="lbl">Card</span><span>${money(pnl.sales_by_payment.card)}</span></div>
      <div class="pl-line"><span class="lbl">Credit (on account)</span><span class="neg">${money(pnl.sales_by_payment.credit)}</span></div>
    </div>
  </div>`);
  const expLines = $('#expLines', pl);
  pnl.expenses_by_category.forEach((e) => expLines.appendChild(el(
    `<div class="pl-line" style="padding-left:16px"><span class="lbl mini">· ${esc(e.category)}</span><span class="mini">${money(e.total)}</span></div>`)));
  grid.appendChild(pl);

  const topPanel = el(`<div class="panel"><h3>Top products by revenue</h3>
    <table><thead><tr><th>Product</th><th class="num">Sold</th><th class="num">Revenue</th><th class="num">Profit</th></tr></thead><tbody></tbody></table></div>`);
  const tb = $('tbody', topPanel);
  if (!top.length) tb.appendChild(el('<tr><td colspan="4" class="empty">No sales in this period</td></tr>'));
  top.forEach((t) => tb.appendChild(el(
    `<tr><td>${esc(t.product_name)}</td><td class="num">${t.units_sold}</td><td class="num">${money(t.revenue)}</td><td class="num pos">${money(t.profit)}</td></tr>`)));
  grid.appendChild(topPanel);

  view.appendChild(grid);
}

/* ================================================================== *
 * CREDIT / RECEIVABLES
 * ================================================================== */
async function renderCredit(view) {
  const data = await api('/sales/credit/outstanding');
  view.innerHTML = '';
  view.appendChild(el(`
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Total outstanding</div><div class="value neg">${money(data.total_outstanding)}</div><div class="sub">${data.count} unpaid invoices</div></div>
    </div>`));

  const panel = el(`<div class="panel mt"><h3>Money owed to you</h3>
    <table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Due</th><th></th></tr></thead><tbody></tbody></table></div>`);
  const tb = $('tbody', panel);
  if (!data.list.length) tb.appendChild(el('<tr><td colspan="7" class="empty">No outstanding credit 🎉</td></tr>'));
  data.list.forEach((s) => {
    const row = el(`<tr><td>${esc(s.invoice_no)}</td><td>${s.date.slice(0, 10)}</td><td>${esc(s.customer_name || '—')}</td>
      <td class="num">${money(s.total)}</td><td class="num">${money(s.amount_paid)}</td><td class="num neg">${money(s.amount_due)}</td><td class="num actions-cell"></td></tr>`);
    const a = $('.actions-cell', row);
    a.appendChild(btn('Receive payment', 'green sm', () => payForm(s)));
    const inv = btn('Invoice', 'ghost sm', () => viewSaleInvoice(s.id)); inv.style.marginLeft = '6px'; a.appendChild(inv);
    tb.appendChild(row);
  });
  view.appendChild(panel);

  function payForm(s) {
    const body = el(`<div><p class="mini" style="margin-bottom:12px">${esc(s.customer_name || 'Customer')} owes <strong>${money(s.amount_due)}</strong> on ${esc(s.invoice_no)}.</p>
      <div class="row"><div class="field"><label>Amount received</label><input id="p_amt" type="number" value="${s.amount_due}" /></div>
        <div class="field"><label>Received as</label><select id="p_method"><option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank</option></select></div></div></div>`);
    const m = modal({ title: 'Receive payment', body, footer: [
      btn('Cancel', 'ghost', () => m.close()),
      btn('Record payment', 'green', async () => {
        try {
          await api(`/sales/${s.id}/payment`, { method: 'POST', body: { amount: Number($('#p_amt', body).value), method: $('#p_method', body).value } });
          m.close(); toast('Payment recorded'); go('credit');
        } catch (e) { toast(e.message, 'err'); }
      }),
    ] });
  }
}

/* ================================================================== *
 * SUPPLIERS / COMPANIES  (purchasing, ledgers, payables)
 * ================================================================== */
async function renderSuppliers(view) {
  $('#topbar-actions').appendChild(btn('+ Add supplier', '', () => supplierForm()));
  const [suppliers, payables] = await Promise.all([
    api('/suppliers'), api('/suppliers/payables/outstanding'),
  ]);
  view.innerHTML = '';
  view.appendChild(el(`<div class="kpi-grid">
    <div class="kpi"><div class="label">Total you owe suppliers</div><div class="value ${payables.total_payable > 0 ? 'neg' : ''}">${money(payables.total_payable)}</div><div class="sub">${payables.count} suppliers with balances</div></div>
    <div class="kpi"><div class="label">Suppliers</div><div class="value">${suppliers.length}</div><div class="sub">companies you buy from</div></div>
  </div>`));

  const panel = el(`<div class="panel mt">
    <div class="panel-head-row"><h3>Suppliers</h3>
      <input id="supSearch" class="search-inline" placeholder="🔍 Search supplier…" /></div>
    <table><thead><tr><th>Supplier</th><th>Phone</th><th class="num">Total purchased</th><th class="num">You owe</th><th></th></tr></thead><tbody></tbody></table></div>`);
  const tbody = $('tbody', panel);
  function drawSup(items) {
    tbody.innerHTML = '';
    if (!items.length) { tbody.appendChild(el('<tr><td colspan="5" class="empty">No suppliers yet. Add one to start recording purchases.</td></tr>')); return; }
    items.forEach((s) => {
      const row = el(`<tr>
        <td><strong>${esc(s.name)}</strong></td><td>${esc(s.phone || '—')}</td>
        <td class="num">${money(s.total_purchased)}</td>
        <td class="num ${s.payable > 0 ? 'neg' : ''}">${money(s.payable)}</td>
        <td class="num actions-cell"></td></tr>`);
      const a = $('.actions-cell', row);
      a.appendChild(btn('Ledger', 'ghost sm', () => ledgerModal(s)));
      if (s.payable > 0) { const p = btn('Pay', 'green sm', () => payModal(s)); p.style.marginLeft = '6px'; a.appendChild(p); }
      const e = btn('Edit', 'ghost sm', () => supplierForm(s)); e.style.marginLeft = '6px'; a.appendChild(e);
      if (canDelete()) { const d = btn('Delete', 'ghost sm', () => delSupplier(s)); d.style.marginLeft = '6px'; a.appendChild(d); }
      tbody.appendChild(row);
    });
  }
  drawSup(suppliers);
  let t;
  $('#supSearch', panel).oninput = (e) => { clearTimeout(t); const q = e.target.value.trim(); t = setTimeout(async () => drawSup(await api('/suppliers' + (q ? '?q=' + encodeURIComponent(q) : ''))), 220); };
  view.appendChild(panel);

  function supplierForm(s) {
    const body = el(`<div>
      <div class="field"><label>Supplier / company name</label><input id="s_name" value="${esc(s?.name || '')}" /></div>
      <div class="field"><label>Phone (optional)</label><input id="s_phone" value="${esc(s?.phone || '')}" /></div>
      <div class="field"><label>Notes (optional)</label><input id="s_notes" value="${esc(s?.notes || '')}" /></div></div>`);
    const m = modal({ title: s ? 'Edit supplier' : 'Add supplier', body, footer: [
      btn('Cancel', 'ghost', () => m.close()),
      btn('Save', 'green', async () => {
        const payload = { name: $('#s_name', body).value, phone: $('#s_phone', body).value, notes: $('#s_notes', body).value };
        try {
          if (s) await api('/suppliers/' + s.id, { method: 'PUT', body: payload });
          else await api('/suppliers', { method: 'POST', body: payload });
          m.close(); toast('Supplier saved'); go('suppliers');
        } catch (e) { toast(e.message, 'err'); }
      }),
    ] });
  }
  function delSupplier(s) {
    const body = el(`<p>Delete supplier <strong>${esc(s.name)}</strong>? Their purchase history stays, but they'll be removed from your supplier list.</p>`);
    const m = modal({ title: 'Delete supplier', body, footer: [
      btn('Cancel', 'ghost', () => m.close()),
      btn('Delete', 'danger', async () => { try { await api('/suppliers/' + s.id, { method: 'DELETE' }); m.close(); toast('Deleted'); go('suppliers'); } catch (e) { toast(e.message, 'err'); } }),
    ] });
  }
  async function ledgerModal(s) {
    const data = await api(`/suppliers/${s.id}/ledger`);
    const rows = data.entries.map((e) => `<tr><td>${e.date.slice(0, 10)}</td><td>${esc(e.type)}${e.ref ? ' · ' + esc(e.ref) : ''}</td>
      <td class="num">${e.debit ? money(e.debit) : ''}</td><td class="num">${e.credit ? money(e.credit) : ''}</td><td class="num">${money(e.balance)}</td></tr>`).join('');
    const body = el(`<div>
      <p class="mini" style="margin-bottom:10px">Running account with <strong>${esc(s.name)}</strong>. Purchases add to what you owe; payments reduce it.</p>
      <table class="ledger"><thead><tr><th>Date</th><th>Detail</th><th class="num">Purchase</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="empty">No activity yet</td></tr>'}</tbody></table>
      <div class="pl-line total mt"><span>Currently payable</span><span class="${data.payable > 0 ? 'neg' : ''}">${money(data.payable)}</span></div></div>`);
    const m = modal({ title: `Ledger — ${s.name}`, body, footer: [btn('Close', 'ghost', () => m.close())] });
  }
  function payModal(s) {
    const body = el(`<div>
      <p class="mini" style="margin-bottom:10px">You owe <strong>${esc(s.name)}</strong> ${money(s.payable)}.</p>
      <div class="row"><div class="field"><label>Amount to pay</label><input id="p_amt" type="number" value="${s.payable}" /></div>
        <div class="field"><label>Paid by</label><select id="p_method"><option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank</option></select></div></div></div>`);
    const m = modal({ title: 'Pay supplier', body, footer: [
      btn('Cancel', 'ghost', () => m.close()),
      btn('Record payment', 'green', async () => {
        try { await api(`/suppliers/${s.id}/payment`, { method: 'POST', body: { amount: Number($('#p_amt', body).value), method: $('#p_method', body).value } }); m.close(); toast('Payment recorded'); go('suppliers'); }
        catch (e) { toast(e.message, 'err'); }
      }),
    ] });
  }
}

/* ================================================================== *
 * PURCHASES  (stock coming in from suppliers, with invoices)
 * ================================================================== */
async function renderPurchases(view) {
  $('#topbar-actions').appendChild(btn('+ Record purchase', '', () => purchaseForm()));
  const [purchases, suppliers, products] = await Promise.all([
    api('/purchases'), api('/suppliers'), api('/products'),
  ]);
  view.innerHTML = '';

  const panel = el(`<div class="panel">
    <div class="panel-head-row"><h3>Purchases (stock in)</h3>
      <input id="purSearch" class="search-inline" placeholder="🔍 Search invoice or supplier…" /></div>
    <table><thead><tr><th>Date</th><th>Invoice</th><th>Supplier</th><th class="num">Items</th><th>Paid by</th><th class="num">Total</th><th class="num">You owe</th><th></th></tr></thead><tbody></tbody></table></div>`);
  const tbody = $('tbody', panel);
  function drawPur(items) {
    tbody.innerHTML = '';
    if (!items.length) { tbody.appendChild(el('<tr><td colspan="8" class="empty">No purchases yet. Record one to add stock.</td></tr>')); return; }
    items.forEach((p) => {
      const row = el(`<tr>
        <td>${p.date.slice(0, 10)}</td><td class="mini">${esc(p.invoice_no)}</td>
        <td>${esc(p.supplier_name || '—')}</td><td class="num">${p.item_count}</td>
        <td><span class="badge ${p.payment_type}">${p.payment_type}</span></td>
        <td class="num">${money(p.total)}</td>
        <td class="num ${p.amount_due > 0 ? 'neg' : ''}">${money(p.amount_due)}</td>
        <td class="num"></td></tr>`);
      $('td:last-child', row).appendChild(btn('Invoice', 'ghost sm', () => viewPurchaseInvoice(p.id)));
      tbody.appendChild(row);
    });
  }
  drawPur(purchases);
  let t;
  $('#purSearch', panel).oninput = (e) => { clearTimeout(t); const q = e.target.value.trim(); t = setTimeout(async () => drawPur(await api('/purchases' + (q ? '?q=' + encodeURIComponent(q) : ''))), 220); };
  view.appendChild(panel);

  function purchaseForm() {
    if (!products.length) { toast('Add products first, then record purchases', 'err'); return; }
    const lines = [];
    const supOpts = suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    const prodOpts = products.map((p) => `<option value="${p.id}" data-cost="${p.cost_price}">${esc(p.name)}</option>`).join('');
    const body = el(`<div>
      <div class="row"><div class="field"><label>Supplier</label><select id="pu_sup"><option value="">— none —</option>${supOpts}</select></div>
        <div class="field"><label>Payment</label><select id="pu_pay"><option value="cash">Cash</option><option value="card">Card</option><option value="credit">Credit (owe supplier)</option></select></div></div>
      <div class="mini" style="margin:6px 0">Add items being purchased:</div>
      <div class="row" style="align-items:flex-end"><div class="field" style="flex:2"><label>Product</label><select id="pu_prod">${prodOpts}</select></div>
        <div class="field"><label>Qty</label><input id="pu_qty" type="number" value="1" /></div>
        <div class="field"><label>Unit cost</label><input id="pu_cost" type="number" value="0" /></div></div>
      <button class="btn ghost sm" id="pu_add" type="button">+ Add item</button>
      <table class="mt" id="pu_lines"><thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">Total</th><th></th></tr></thead><tbody></tbody></table>
      <div id="pu_credit" style="display:none"><div class="field"><label>Amount paid now (rest on credit)</label><input id="pu_paid" type="number" value="0" /></div></div>
      <div class="pl-line total mt"><span>Purchase total</span><span id="pu_total">${money(0)}</span></div>
    </div>`);
    // set cost default when product changes
    const costInput = $('#pu_cost', body);
    $('#pu_prod', body).onchange = (e) => { const o = e.target.selectedOptions[0]; costInput.value = o.getAttribute('data-cost') || 0; };
    costInput.value = products[0].cost_price;
    $('#pu_pay', body).onchange = (e) => { $('#pu_credit', body).style.display = e.target.value === 'credit' ? 'block' : 'none'; };

    function redraw() {
      const lb = $('#pu_lines tbody', body); lb.innerHTML = '';
      let total = 0;
      lines.forEach((l, i) => {
        total += l.quantity * l.unit_cost;
        const r = el(`<tr><td>${esc(l.name)}</td><td class="num">${l.quantity}</td><td class="num">${money(l.unit_cost)}</td><td class="num">${money(l.quantity * l.unit_cost)}</td><td class="num"></td></tr>`);
        $('td:last-child', r).appendChild(btn('✕', 'ghost sm', () => { lines.splice(i, 1); redraw(); }));
        lb.appendChild(r);
      });
      $('#pu_total', body).textContent = money(total);
    }
    $('#pu_add', body).onclick = () => {
      const sel = $('#pu_prod', body); const pid = Number(sel.value);
      const prod = products.find((p) => p.id === pid);
      const qty = Number($('#pu_qty', body).value); const cost = Number(costInput.value);
      if (!prod || qty <= 0) return toast('Pick a product and quantity', 'err');
      lines.push({ product_id: pid, name: prod.name, quantity: qty, unit_cost: cost });
      redraw();
    };

    const m = modal({ title: 'Record purchase', body, footer: [
      btn('Cancel', 'ghost', () => m.close()),
      btn('Save purchase', 'green', async () => {
        if (!lines.length) return toast('Add at least one item', 'err');
        const payType = $('#pu_pay', body).value;
        const payload = { supplier_id: $('#pu_sup', body).value || null, payment_type: payType, items: lines };
        if (payType === 'credit') payload.amount_paid = Number($('#pu_paid', body).value || 0);
        try { const r = await api('/purchases', { method: 'POST', body: payload }); m.close(); toast('Purchase recorded · stock updated'); viewPurchaseInvoice(r.id); go('purchases'); }
        catch (e) { toast(e.message, 'err'); }
      }),
    ] });
  }
}

async function viewPurchaseInvoice(id) {
  const p = await api('/purchases/' + id);
  const rows = p.items.map((it) => `<tr><td>${esc(it.product_name)}</td><td style="text-align:right">${it.quantity}</td><td style="text-align:right">${money(it.unit_cost)}</td><td style="text-align:right">${money(it.line_total)}</td></tr>`).join('');
  const paid = p.total - p.amount_due;
  printableInvoice({
    heading: 'PURCHASE INVOICE', number: p.invoice_no, date: p.date.slice(0, 16).replace('T', ' '),
    party: `Supplier: ${p.supplier_name || '—'}${p.supplier_phone ? ' · ' + p.supplier_phone : ''}`,
    rows, cols: ['Product', 'Qty', 'Unit cost', 'Total'],
    totals: [['Subtotal', money(p.subtotal)], ['Discount', '−' + money(p.discount)], ['Total', money(p.total)], ['Paid', money(paid)], ['Balance owed', money(p.amount_due)]],
    note: `Paid by: ${p.payment_type}`,
  });
}

async function viewSaleInvoice(id) {
  const s = await api('/sales/' + id);
  const rows = s.items.map((it) => `<tr><td>${esc(it.product_name)}</td><td style="text-align:right">${it.quantity}</td><td style="text-align:right">${money(it.unit_price)}</td><td style="text-align:right">${it.line_discount ? '−' + money(it.line_discount) : '—'}</td><td style="text-align:right">${money(it.line_total)}</td></tr>`).join('');
  printableInvoice({
    heading: 'SALES INVOICE', number: s.invoice_no, date: s.date.slice(0, 16).replace('T', ' '),
    party: s.customer_name ? `Customer: ${s.customer_name}` : 'Walk-in customer',
    rows, cols: ['Item', 'Qty', 'Price', 'Disc', 'Total'],
    totals: [['Subtotal', money(s.subtotal)], ['Discount', '−' + money(s.discount)], ['Total', money(s.total)], ['Paid', money(s.amount_paid)], ['Balance due', money(s.amount_due)]],
    note: `Payment: ${s.payment_type}`,
  });
}

// Opens a clean, printable invoice in a modal (with a Print button).
function printableInvoice({ heading, number, date, party, rows, cols, totals, note }) {
  const totalsHtml = totals.map(([k, v], i) => `<div class="pl-line ${i === totals.length - 1 || k === 'Total' ? 'total' : ''}"><span>${k}</span><span>${v}</span></div>`).join('');
  const body = el(`<div class="invoice" id="invoiceArea">
    <div class="inv-head"><div><div class="inv-title">${heading}</div><div class="mini">${esc(number)}</div></div>
      <div class="inv-meta"><div>${esc(date)}</div><div>${esc(party)}</div></div></div>
    <table class="inv-table"><thead><tr>${cols.map((c, i) => `<th${i ? ' style="text-align:right"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    <div class="inv-totals">${totalsHtml}</div>
    ${note ? `<div class="mini mt">${esc(note)}</div>` : ''}
  </div>`);
  const printBtn = btn('🖨 Print', 'green', () => {
    const w = window.open('', '_blank', 'width=420,height=640');
    w.document.write(`<html><head><title>${esc(number)}</title><style>
      body{font-family:system-ui,Arial,sans-serif;padding:20px;color:#111}
      .inv-title{font-size:20px;font-weight:800}.mini{color:#666;font-size:12px}
      table{width:100%;border-collapse:collapse;margin:14px 0}
      th,td{padding:6px 4px;border-bottom:1px solid #eee;font-size:13px}
      .inv-head{display:flex;justify-content:space-between}.inv-meta{text-align:right;font-size:12px}
      .pl-line{display:flex;justify-content:space-between;padding:3px 0;font-size:13px}
      .pl-line.total{font-weight:800;border-top:2px solid #111;margin-top:4px;padding-top:6px}
    </style></head><body>${$('#invoiceArea', body).innerHTML}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  });
  const m = modal({ title: 'Invoice', body, footer: [btn('Close', 'ghost', () => m.close()), printBtn] });
}

/* ================================================================== *
 * CASH IN HAND
 * ================================================================== */
async function renderCash(view) {
  if (isOwner()) $('#topbar-actions').appendChild(btn('± Adjust cash', '', () => adjustForm()));
  const [b, led] = await Promise.all([api('/cash/on-hand'), api('/cash/ledger')]);
  view.innerHTML = '';
  view.appendChild(el(`<div class="kpi-grid">
    <div class="kpi"><div class="label">Cash in hand</div><div class="value ${b.cash_on_hand < 0 ? 'neg' : 'pos'}">${money(b.cash_on_hand)}</div><div class="sub">physical cash in your drawer</div></div>
    <div class="kpi"><div class="label">Cash in (all time)</div><div class="value pos">${money(b.total_in)}</div><div class="sub">sales + received + added</div></div>
    <div class="kpi"><div class="label">Cash out (all time)</div><div class="value neg">${money(b.total_out)}</div><div class="sub">purchases + suppliers + expenses</div></div>
  </div>`));

  view.appendChild(el(`<div class="panel mt"><h3>Where the cash comes from and goes</h3>
    <div class="cash-break">
      <div><span>Cash sales</span><strong class="pos">+${money(b.cash_sales_in)}</strong></div>
      <div><span>Received on credit</span><strong class="pos">+${money(b.cash_repayments_in)}</strong></div>
      <div><span>Cash added (float)</span><strong class="pos">+${money(b.cash_added_in)}</strong></div>
      <div><span>Paid for purchases</span><strong class="neg">−${money(b.cash_purchases_out)}</strong></div>
      <div><span>Paid to suppliers</span><strong class="neg">−${money(b.supplier_payments_out)}</strong></div>
      <div><span>Cash expenses</span><strong class="neg">−${money(b.cash_expenses_out)}</strong></div>
      <div><span>Cash removed</span><strong class="neg">−${money(b.cash_removed_out)}</strong></div>
    </div></div>`));

  const panel = el(`<div class="panel mt"><h3>Cash movements</h3>
    <table><thead><tr><th>Date</th><th>Detail</th><th class="num">In</th><th class="num">Out</th><th class="num">Balance</th></tr></thead><tbody></tbody></table></div>`);
  const tb = $('tbody', panel);
  if (!led.ledger.length) tb.appendChild(el('<tr><td colspan="5" class="empty">No cash movements yet</td></tr>'));
  led.ledger.forEach((r) => tb.appendChild(el(`<tr><td>${r.date.slice(0, 10)}</td><td>${esc(r.label)}</td>
    <td class="num pos">${r.in ? money(r.in) : ''}</td><td class="num neg">${r.out ? money(r.out) : ''}</td><td class="num">${money(r.balance)}</td></tr>`)));
  view.appendChild(panel);

  function adjustForm() {
    const body = el(`<div>
      <p class="mini" style="margin-bottom:10px">Add cash (opening float, extra cash put in) or remove cash (owner withdrawal). Use a minus sign to remove.</p>
      <div class="field"><label>Amount (use − to remove)</label><input id="c_amt" type="number" value="0" /></div>
      <div class="field"><label>Reason</label><input id="c_reason" placeholder="e.g. Opening float / Owner withdrawal" /></div></div>`);
    const m = modal({ title: 'Adjust cash', body, footer: [
      btn('Cancel', 'ghost', () => m.close()),
      btn('Save', 'green', async () => {
        try { await api('/cash/adjust', { method: 'POST', body: { amount: Number($('#c_amt', body).value), reason: $('#c_reason', body).value } }); m.close(); toast('Cash updated'); go('cash'); }
        catch (e) { toast(e.message, 'err'); }
      }),
    ] });
  }
}

/* ================================================================== *
 * STAFF MANAGEMENT (owner only)
 * ================================================================== */
async function renderStaff(view) {
  if (!isOwner()) { view.innerHTML = '<div class="empty">Only the owner can manage staff.</div>'; return; }
  const data = await api('/auth/users');
  view.innerHTML = '';

  $('#topbar-actions').appendChild(btn('+ Add staff', '', () => addStaffForm()));

  view.appendChild(el(`<div class="panel">
    <h3>People who can sign in</h3>
    <p class="mini" style="margin:-4px 0 12px">The owner has full rights. Staff can record sales, add stock and expenses, but <strong>cannot delete</strong> or <strong>give discounts</strong> unless you switch those on for them.</p>
    <table><thead><tr><th>Username</th><th>Role</th><th>Can delete</th><th>Can discount</th><th>Added</th><th></th></tr></thead><tbody></tbody></table>
  </div>`));
  const tb = $('tbody', view);

  data.list.forEach((u) => {
    const isOwnerRow = u.role === 'owner';
    const row = el(`<tr>
      <td><strong>${esc(u.username)}</strong>${u.is_you ? ' <span class="mini">(you)</span>' : ''}</td>
      <td><span class="badge ${isOwnerRow ? 'owner-badge' : 'card'}">${isOwnerRow ? 'Owner' : 'Staff'}</span></td>
      <td class="perm-cell"></td>
      <td class="disc-cell"></td>
      <td>${(u.created_at || '').slice(0, 10)}</td>
      <td class="num actions-cell"></td>
    </tr>`);

    // permission toggles (staff only)
    const permCell = $('.perm-cell', row);
    const discCell = $('.disc-cell', row);
    if (isOwnerRow) {
      permCell.appendChild(el('<span class="mini">Always</span>'));
      discCell.appendChild(el('<span class="mini">Always</span>'));
    } else {
      const mkToggle = (field, on, okMsg, offMsg) => {
        const toggle = el(`<label class="switch"><input type="checkbox" ${on ? 'checked' : ''}/><span class="slider"></span></label>`);
        $('input', toggle).onchange = async (e) => {
          try {
            await api(`/auth/users/${u.id}`, { method: 'PATCH', body: { [field]: e.target.checked } });
            toast(e.target.checked ? okMsg : offMsg);
          } catch (err) { toast(err.message, 'err'); e.target.checked = !e.target.checked; }
        };
        return toggle;
      };
      permCell.appendChild(mkToggle('can_delete', u.can_delete, 'Delete rights granted', 'Delete rights removed'));
      discCell.appendChild(mkToggle('can_discount', u.can_discount, 'Discount rights granted', 'Discount rights removed'));
    }

    // remove button (staff only, not yourself)
    if (!isOwnerRow && !u.is_you) {
      $('.actions-cell', row).appendChild(btn('Remove', 'ghost sm', () => {
        const body = el(`<p>Remove the login for <strong>${esc(u.username)}</strong>? They will no longer be able to sign in. Your shop data is not affected.</p>`);
        const m = modal({ title: 'Remove staff login', body, footer: [
          btn('Cancel', 'ghost', () => m.close()),
          btn('Remove', 'danger', async () => {
            try { await api(`/auth/users/${u.id}`, { method: 'DELETE' }); m.close(); toast('Staff login removed'); go('staff'); }
            catch (e) { toast(e.message, 'err'); }
          }),
        ] });
      }));
    }
    tb.appendChild(row);
  });

  function addStaffForm() {
    const body = el(`<div>
      <p class="mini" style="margin-bottom:12px">Create a login for a staff member. They sign in on their own device with these details.</p>
      <div class="field"><label>Username</label><input id="st_user" type="text" placeholder="must be different from other logins" /></div>
      <div class="field"><label>Password</label><input id="st_pass" type="password" placeholder="at least 6 characters" /></div>
      <label class="check-row"><input id="st_del" type="checkbox" /> <span>Allow this staff member to delete data</span></label>
      <label class="check-row"><input id="st_disc" type="checkbox" /> <span>Allow this staff member to give discounts</span></label>
    </div>`);
    const m = modal({ title: 'Add staff login', body, footer: [
      btn('Cancel', 'ghost', () => m.close()),
      btn('Create', 'green', async () => {
        try {
          await api('/auth/users', { method: 'POST', body: {
            username: $('#st_user', body).value,
            password: $('#st_pass', body).value,
            can_delete: $('#st_del', body).checked,
            can_discount: $('#st_disc', body).checked,
          } });
          m.close(); toast('Staff login created'); go('staff');
        } catch (e) { toast(e.message, 'err'); }
      }),
    ] });
  }
}

/* ================================================================== *
 * AUTHENTICATION — login / first-run setup / logout
 * ================================================================== */
function authOverlay(inner) {
  const app = $('#app');
  app.style.display = 'none';
  let root = $('#auth-root');
  if (!root) { root = el('<div id="auth-root"></div>'); document.body.appendChild(root); }
  root.innerHTML = '';
  root.appendChild(inner);
}
function enterApp(user) {
  currentUser = typeof user === 'string' ? { username: user, role: 'owner', can_delete: true } : user;
  const root = $('#auth-root'); if (root) root.remove();
  $('#app').style.display = '';
  // show who's signed in (+ role) and a logout button in the sidebar footer
  let acct = $('#account-box');
  if (!acct) {
    acct = el('<div id="account-box" class="account-box"></div>');
    $('.sidebar-foot').appendChild(acct);
  }
  acct.innerHTML = '';
  const roleLabel = isOwner() ? 'Owner' : 'Staff';
  acct.appendChild(el(`<div class="acct-user">👤 ${esc(currentUser.username)} <span class="acct-role">${roleLabel}</span></div>`));
  acct.appendChild(btn('Log out', 'ghost sm', async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    location.reload();
  }));
  $('#period').onchange = (e) => { state.period = e.target.value; go(state.route); };
  buildNav();
  go('dashboard');
}

function showAuthScreen() {
  // decide between first-run setup and normal login
  fetch('/api/auth/me', { credentials: 'include' })
    .then((r) => r.json())
    .then((s) => {
      if (s.authenticated) return enterApp(s.user);
      if (s.needsSetup) return renderSetup(s);
      return renderLogin(s);
    })
    .catch(() => renderLogin({}));
}

// On a public demo site, offer a one-click way in so visitors aren't stuck
// at a password prompt.
function demoBanner(state) {
  if (!state || !state.demo) return null;
  const box = el(`<div class="demo-box">
    <div class="demo-title">👋 This is a live demo</div>
    <div class="demo-text">Explore a sample shop with real data — inventory, sales, purchases, cash and reports. Nothing here affects a real business.</div>
  </div>`);
  const go = btn('Enter demo →', 'green', async () => {
    try {
      const r = await api('/auth/login', { method: 'POST', body: { username: state.demo_username, password: state.demo_password } });
      enterApp(r.user);
    } catch (e) { toast(e.message, 'err'); }
  });
  go.style.width = '100%';
  box.appendChild(go);
  box.appendChild(el(`<div class="demo-creds">Or sign in manually — owner: <strong>${esc(state.demo_username)}</strong> / <strong>${esc(state.demo_password)}</strong> · staff: <strong>staff</strong> / <strong>staff1234</strong></div>`));
  return box;
}

function authCard(title, subtitle, fields, actionLabel, onSubmit) {
  const card = el(`<div class="auth-wrap"><div class="auth-card">
    <div class="auth-brand"><div class="brand-mark">R</div><div class="brand-name">Retail Manager</div></div>
    <h2>${esc(title)}</h2><p class="auth-sub">${esc(subtitle)}</p>
    <div class="auth-fields"></div>
    <div class="auth-err" style="display:none"></div>
  </div></div>`);
  const fwrap = $('.auth-fields', card);
  fields.forEach((f) => fwrap.appendChild(el(
    `<div class="field"><label>${esc(f.label)}</label><input id="${f.id}" type="${f.type || 'text'}" placeholder="${esc(f.ph || '')}" /></div>`
  )));
  const err = $('.auth-err', card);
  const submit = btn(actionLabel, 'green', async () => {
    err.style.display = 'none';
    const vals = {}; fields.forEach((f) => (vals[f.id] = $('#' + f.id, card).value));
    try { await onSubmit(vals); } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
  });
  submit.style.width = '100%'; submit.style.marginTop = '6px';
  fwrap.appendChild(submit);
  // Enter key submits
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit.click(); });
  return card;
}

function renderSetup(state) {
  const card = authCard(
    'Create your owner account',
    'This is your first time — set a username and password. You’ll use these to sign in from any device.',
    [
      { id: 'su_user', label: 'Choose a username', ph: 'e.g. sania' },
      { id: 'su_pass', label: 'Choose a password', type: 'password', ph: 'at least 6 characters' },
    ],
    'Create account & enter',
    async (v) => {
      const r = await api('/auth/setup', { method: 'POST', body: { username: v.su_user, password: v.su_pass } });
      enterApp(r.user);
    },
  );
  const banner = demoBanner(state);
  if (banner) $('.auth-card', card).insertBefore(banner, $('.auth-fields', card));
  authOverlay(card);
}

function renderLogin(state) {
  const card = authCard(
    'Sign in',
    'Enter your username and password to open your shop.',
    [
      { id: 'li_user', label: 'Username', ph: 'your username' },
      { id: 'li_pass', label: 'Password', type: 'password', ph: 'your password' },
    ],
    'Sign in',
    async (v) => {
      const r = await api('/auth/login', { method: 'POST', body: { username: v.li_user, password: v.li_pass } });
      enterApp(r.user);
    },
  );
  const banner = demoBanner(state);
  if (banner) $('.auth-card', card).insertBefore(banner, $('.auth-fields', card));
  authOverlay(card);
}

/* ---------- boot ---------- */
showAuthScreen();
