// Core ticketing: inventory, orders, ticket issuing, signed QR tokens, check-in.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { q, tx, DATA_DIR } = require("./db");

const HOLD_MINUTES = 20; // unpaid checkout reserves tickets this long

// ---- Secret used to sign tickets (so codes can't be guessed or forged) ----
function loadSecret() {
  if (process.env.TICKET_SECRET) return process.env.TICKET_SECRET;
  const f = path.join(DATA_DIR, "secret.key");
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  return fs.readFileSync(f, "utf8").trim();
}
const SECRET = loadSecret();

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
function randomCode(len = 10) {
  const bytes = crypto.randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}
const randomKey = (n = 24) => crypto.randomBytes(n).toString("base64url");

function sign(code) {
  return crypto.createHmac("sha256", SECRET).update("ticket:" + code).digest("base64url").slice(0, 12);
}
function tokenFor(code) { return code + "." + sign(code); }

/** Accepts a token, a full ticket URL, or a bare code typed in manually. Returns code or null. */
function parseToken(input) {
  if (!input) return null;
  let s = String(input).trim();
  const m = s.match(/\/t\/([A-Za-z0-9._-]+)/);
  if (m) s = m[1];
  const [code, sig] = s.split(".");
  if (!code) return null;
  const c = code.toUpperCase();
  if (sig === undefined) return { code: c, signed: false };
  const ok = sig.length === 12 && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(c)));
  return ok ? { code: c, signed: true } : null;
}

// ---- Time helpers (events are stored in local venue time) ----
const TZ = process.env.TIMEZONE || "America/Toronto";
function nowLocal() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// ---- Inventory ----
function expireStaleHolds() {
  q.run(`UPDATE orders SET status='cancelled' WHERE status='pending' AND created_at < datetime('now', ?)`, `-${HOLD_MINUTES} minutes`);
}
function soldCount(typeId) {
  const issued = q.get(`SELECT COUNT(*) n FROM tickets WHERE ticket_type_id=? AND status='valid'`, typeId).n;
  const held = q.get(`SELECT COALESCE(SUM(oi.qty),0) n FROM order_items oi JOIN orders o ON o.id=oi.order_id
                      WHERE oi.ticket_type_id=? AND o.status='pending'`, typeId).n;
  return issued + held;
}
function tierState(t, now = nowLocal()) {
  const remaining = Math.max(0, t.quantity - soldCount(t.id));
  let state = "on_sale";
  if (!t.active) state = "hidden";
  else if (t.sales_start && now < t.sales_start) state = "not_started";
  else if (t.sales_end && now > t.sales_end) state = "ended";
  else if (remaining === 0) state = "sold_out";
  return { ...t, remaining, state };
}
function tiersForEvent(eventId, { includeHidden = false } = {}) {
  expireStaleHolds();
  const now = nowLocal();
  return q.all(`SELECT * FROM ticket_types WHERE event_id=? ORDER BY sort, price_cents`, eventId)
    .map((t) => tierState(t, now))
    .filter((t) => includeHidden || t.state !== "hidden");
}

// ---- Orders ----
class OrderError extends Error {}

/** Create a pending order, reserving inventory. items: { [ticketTypeId]: qty } */
function createOrder({ event, items, name, email, phone, currency }) {
  return tx(() => {
    expireStaleHolds();
    const now = nowLocal();
    const lines = [];
    for (const [typeIdRaw, qtyRaw] of Object.entries(items || {})) {
      const qty = Math.floor(Number(qtyRaw));
      if (!qty) continue;
      if (qty < 0 || qty > 50) throw new OrderError("Invalid quantity");
      const t = q.get(`SELECT * FROM ticket_types WHERE id=? AND event_id=?`, Number(typeIdRaw), event.id);
      if (!t) throw new OrderError("Ticket type not found");
      const st = tierState(t, now);
      if (st.state !== "on_sale") throw new OrderError(`${t.name} is not available (${st.state.replace("_", " ")})`);
      if (qty > t.max_per_order) throw new OrderError(`Max ${t.max_per_order} ${t.name} tickets per order`);
      if (qty > st.remaining) throw new OrderError(`Only ${st.remaining} ${t.name} tickets left`);
      lines.push({ t, qty });
    }
    if (!lines.length) throw new OrderError("Pick at least one ticket");
    const total = lines.reduce((s, l) => s + l.qty * l.t.price_cents, 0);
    const id = "WN" + randomCode(8);
    q.run(`INSERT INTO orders (id, event_id, buyer_name, buyer_email, buyer_phone, total_cents, currency, access_key)
           VALUES (?,?,?,?,?,?,?,?)`, id, event.id, name, email, phone || "", total, currency, randomKey());
    for (const l of lines) q.run(`INSERT INTO order_items VALUES (?,?,?,?)`, id, l.t.id, l.qty, l.t.price_cents);
    return getOrder(id);
  });
}

function getOrder(id) {
  const o = q.get(`SELECT * FROM orders WHERE id=?`, id);
  if (!o) return null;
  o.items = q.all(`SELECT oi.*, tt.name FROM order_items oi JOIN ticket_types tt ON tt.id=oi.ticket_type_id WHERE order_id=?`, id);
  o.tickets = q.all(`SELECT t.*, tt.name AS tier FROM tickets t JOIN ticket_types tt ON tt.id=t.ticket_type_id
                     WHERE order_id=? ORDER BY tt.sort, t.created_at`, id)
    .map((t) => ({ ...t, token: tokenFor(t.code) }));
  return o;
}

/** Mark an order paid and issue its tickets. Safe to call more than once. Returns true if newly paid. */
function fulfillOrder(id, { paymentRef = "", status = "paid", demo = false } = {}) {
  return tx(() => {
    const o = q.get(`SELECT * FROM orders WHERE id=?`, id);
    if (!o) throw new OrderError("Order not found");
    if (o.status === "paid" || o.status === "comp") return false;
    // A payment that lands after the hold expired still gets honoured.
    q.run(`UPDATE orders SET status=?, payment_ref=?, demo=?, paid_at=datetime('now') WHERE id=?`, status, paymentRef, demo ? 1 : 0, id);
    for (const it of q.all(`SELECT * FROM order_items WHERE order_id=?`, id)) {
      for (let i = 0; i < it.qty; i++) {
        let code; do { code = randomCode(10); } while (q.get(`SELECT 1 FROM tickets WHERE code=?`, code));
        q.run(`INSERT INTO tickets (code, order_id, event_id, ticket_type_id, holder_name) VALUES (?,?,?,?,?)`,
          code, id, o.event_id, it.ticket_type_id, o.buyer_name);
      }
    }
    return true;
  });
}

function cancelOrder(id) {
  return tx(() => {
    q.run(`UPDATE orders SET status='cancelled' WHERE id=?`, id);
    q.run(`UPDATE tickets SET status='void' WHERE order_id=?`, id);
  });
}

// ---- Check-in ----
function lookupTicket(code) {
  return q.get(`SELECT t.*, tt.name AS tier, e.title AS event_title, e.starts_at, e.venue, e.city, e.id AS event_id,
                       o.buyer_email, o.status AS order_status
                FROM tickets t JOIN ticket_types tt ON tt.id=t.ticket_type_id
                JOIN events e ON e.id=t.event_id JOIN orders o ON o.id=t.order_id WHERE t.code=?`, code);
}

/** Returns { result: 'ok'|'already'|'void'|'wrong_event'|'invalid', ticket } */
function checkIn(input, { eventId } = {}) {
  const parsed = parseToken(input);
  if (!parsed) return { result: "invalid" };
  return tx(() => {
    const t = lookupTicket(parsed.code);
    if (!t) return { result: "invalid" };
    if (t.status !== "valid") return { result: "void", ticket: t };
    if (eventId && Number(eventId) !== t.event_id) return { result: "wrong_event", ticket: t };
    if (t.checked_in_at) return { result: "already", ticket: t };
    q.run(`UPDATE tickets SET checked_in_at=datetime('now') WHERE code=?`, t.code);
    return { result: "ok", ticket: lookupTicket(t.code) };
  });
}

module.exports = {
  OrderError, createOrder, getOrder, fulfillOrder, cancelOrder, tiersForEvent, tokenFor, parseToken,
  checkIn, lookupTicket, randomCode, randomKey, nowLocal, expireStaleHolds, TZ, HOLD_MINUTES,
};
