// db/driver.js
// Returns a database handle with a consistent API regardless of driver.
//
// Preferred driver: better-sqlite3 (fast, battle-tested). If it isn't installed
// (e.g. native build was skipped), we fall back to Node's built-in node:sqlite.
// Both expose prepare().run/get/all with { changes, lastInsertRowid }.
// We normalize the two extra helpers our code uses: .pragma() and .transaction().

export async function openDatabase(path) {
  // --- Try better-sqlite3 first ---
  try {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(path);
    console.log('DB driver: better-sqlite3');
    return db; // already has .pragma() and .transaction()
  } catch (e) {
    // fall through to built-in
  }

  // --- Fallback: node:sqlite (Node >= 22.5) ---
  const { DatabaseSync } = await import('node:sqlite');
  const raw = new DatabaseSync(path);
  console.log('DB driver: node:sqlite (built-in fallback)');

  // Adapter to match the small slice of better-sqlite3 API we rely on.
  raw.pragma = (stmt) => raw.exec(`PRAGMA ${stmt};`);
  raw.transaction = (fn) => {
    return (...args) => {
      raw.exec('BEGIN');
      try {
        const result = fn(...args);
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    };
  };
  return raw;
}
