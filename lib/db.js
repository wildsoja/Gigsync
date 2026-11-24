// SQLite storage (built into Node 22+, no native build needed).
process.removeAllListeners("warning"); // hide node:sqlite "experimental" notice
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });

const db = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, "wildnation.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  tagline TEXT DEFAULT '',
  description TEXT DEFAULT '',
  starts_at TEXT NOT NULL,           -- local time "YYYY-MM-DDTHH:MM"
  ends_at TEXT DEFAULT '',
  venue TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  age TEXT DEFAULT '19+',
  dress_code TEXT DEFAULT '',
  flyer TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft', -- draft | published | cancelled
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ticket_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 100,
  max_per_order INTEGER NOT NULL DEFAULT 10,
  sales_start TEXT DEFAULT '',
  sales_end TEXT DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_phone TEXT DEFAULT '',
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | comp | cancelled
  payment_ref TEXT DEFAULT '',
  access_key TEXT NOT NULL,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);
CREATE TABLE IF NOT EXISTS order_items (
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ticket_type_id INTEGER NOT NULL REFERENCES ticket_types(id),
  qty INTEGER NOT NULL,
  unit_cents INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  code TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  event_id INTEGER NOT NULL REFERENCES events(id),
  ticket_type_id INTEGER NOT NULL REFERENCES ticket_types(id),
  holder_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'valid', -- valid | void
  checked_in_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  name TEXT, email TEXT, phone TEXT,
  event_type TEXT, event_date TEXT,
  estimate_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'new', -- new | quoted | confirmed | declined
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, email TEXT, subject TEXT, message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_orders_event ON orders(event_id);
`);

function tx(fn) {
  db.exec("BEGIN IMMEDIATE");
  try { const r = fn(); db.exec("COMMIT"); return r; }
  catch (e) { db.exec("ROLLBACK"); throw e; }
}

const q = {
  all: (sql, ...p) => db.prepare(sql).all(...p),
  get: (sql, ...p) => db.prepare(sql).get(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
};

module.exports = { db, q, tx, DATA_DIR };
