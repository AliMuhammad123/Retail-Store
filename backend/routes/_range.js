// routes/_range.js
// Parses ?from=YYYY-MM-DD&to=YYYY-MM-DD. Defaults to the current calendar month.
// Returns SQLite-friendly datetime bounds.

export function rangeFromQuery(req) {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let from = req.query.from;
  let to = req.query.to;

  if (!from) from = firstOfMonth.toISOString().slice(0, 10);
  if (!to)   to   = now.toISOString().slice(0, 10);

  // Make the range inclusive of the whole 'to' day.
  return { from: `${from} 00:00:00`, to: `${to} 23:59:59`, fromDate: from, toDate: to };
}
