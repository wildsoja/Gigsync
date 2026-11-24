// Wild Nation: website, DJ booking requests and native ticketing.
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const { q, DATA_DIR } = require("./lib/db");
const T = require("./lib/ticketing");
const stripe = require("./lib/stripe");
const mail = require("./lib/mail");
const audience = require("./lib/audience");
const BOOKING = require("./public/assets/js/booking-config.js");
const Pricing = require("./public/assets/js/pricing.js");

const PORT = process.env.PORT || 3000;
const CURRENCY = (process.env.CURRENCY || "CAD").toUpperCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const PUBLIC = path.join(__dirname, "public");
const UPLOADS = path.join(DATA_DIR, "uploads");
const DEMO = !stripe.enabled(); // no Stripe key: checkout issues tickets without payment (for testing)

const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");

// Stripe webhook needs the raw body, so it's registered before the JSON parser.
app.post("/api/stripe/webhook", express.raw({ type: "*/*" }), async (req, res) => {
  let evt;
  try { evt = stripe.verifyWebhook(req.body.toString("utf8"), req.get("stripe-signature")); }
  catch (e) { return res.status(400).send(e.message); }
  const s = evt.data && evt.data.object;
  const orderId = s && s.metadata && s.metadata.order_id;
  if (orderId && evt.type === "checkout.session.completed" && s.payment_status === "paid") {
    await completeOrder(orderId, s.payment_intent || s.id, baseUrl(req));
  } else if (orderId && evt.type === "checkout.session.expired") {
    const o = T.getOrder(orderId);
    if (o && o.status === "pending") T.cancelOrder(orderId);
  }
  res.json({ received: true });
});

app.use(express.json({ limit: "8mb" }));

// ---------- helpers ----------
const baseUrl = (req) => (process.env.BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
const clean = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const money = (c) => new Intl.NumberFormat("en-CA", { style: "currency", currency: CURRENCY }).format(c / 100);
const slugify = (s) => clean(s, 80).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function formatWhen(e) {
  const [d, t] = e.starts_at.split("T");
  const dt = new Date(`${d}T${t || "00:00"}:00`);
  return dt.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) +
    " · " + dt.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
}

function publicEvent(e, { tiers = true } = {}) {
  const out = {
    slug: e.slug, title: e.title, tagline: e.tagline, description: e.description, starts_at: e.starts_at,
    ends_at: e.ends_at, venue: e.venue, address: e.address, city: e.city, age: e.age, dress_code: e.dress_code,
    flyer: e.flyer, status: e.status, when: formatWhen(e),
  };
  if (tiers) {
    out.tiers = T.tiersForEvent(e.id).map((t) => ({
      id: t.id, name: t.name, description: t.description, price_cents: t.price_cents, max_per_order: t.max_per_order,
      state: t.state, remaining: t.remaining <= 20 ? t.remaining : null, sales_start: t.sales_start,
    }));
    const onSale = out.tiers.filter((t) => t.state === "on_sale");
    out.from_cents = onSale.length ? Math.min(...onSale.map((t) => t.price_cents)) : null;
    out.sold_out = out.tiers.length > 0 && out.tiers.every((t) => t.state === "sold_out");
  }
  return out;
}

async function completeOrder(orderId, paymentRef, base, opts = {}) {
  const fresh = T.fulfillOrder(orderId, { paymentRef, ...opts });
  if (!fresh) return;
  const order = T.getOrder(orderId);
  const event = q.get("SELECT * FROM events WHERE id=?", order.event_id);
  await mail.sendTickets({ order, event, baseUrl: base, when: formatWhen(event) });
  mail.notifyOwner(`🎟 ${order.tickets.length} ticket(s) sold: ${event.title}`,
    `${order.buyer_name} <${order.buyer_email}> bought ${order.items.map((i) => `${i.qty}× ${i.name}`).join(", ")} for ${money(order.total_cents)}.\nOrder ${order.id}${order.demo ? " (TEST MODE, no payment)" : ""}`);
}

// ---------- public API ----------
app.get("/api/config", (req, res) => {
  res.json({ currency: CURRENCY, demo: DEMO, payments: stripe.enabled() ? "stripe" : "test", email: mail.enabled() });
});

app.get("/api/events", (req, res) => {
  const now = T.nowLocal().slice(0, 10);
  const rows = q.all(`SELECT * FROM events WHERE status IN ('published','cancelled') AND substr(starts_at,1,10) >= ? ORDER BY starts_at`, now);
  res.json(rows.map((e) => publicEvent(e)));
});

app.get("/api/events/:slug", (req, res) => {
  const e = q.get(`SELECT * FROM events WHERE slug=? AND status IN ('published','cancelled')`, req.params.slug);
  if (!e) return res.status(404).json({ error: "Event not found" });
  res.json(publicEvent(e));
});

app.post("/api/orders", wrap(async (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 120), email = clean(b.email, 200).toLowerCase(), phone = clean(b.phone, 40);
  if (!name) return res.status(400).json({ error: "Please enter your name" });
  if (!isEmail(email)) return res.status(400).json({ error: "Please enter a valid email" });
  const event = q.get(`SELECT * FROM events WHERE slug=? AND status='published'`, clean(b.event, 100));
  if (!event) return res.status(404).json({ error: "This event isn't on sale" });

  let order;
  try { order = T.createOrder({ event, items: b.items, name, email, phone, currency: CURRENCY }); }
  catch (e) { if (e instanceof T.OrderError) return res.status(400).json({ error: e.message }); throw e; }

  audience.upsertContact({ email, name, phone, source: "ticket", consent: !!b.optin });
  const base = baseUrl(req);
  const orderUrl = `${base}/order/${order.id}?k=${order.access_key}`;
  if (order.total_cents === 0 || DEMO) {
    await completeOrder(order.id, order.total_cents === 0 ? "free" : "test-mode", base, { demo: DEMO && order.total_cents > 0 });
    return res.json({ redirect: orderUrl });
  }
  try {
    const session = await stripe.createCheckout({
      order, event, currency: CURRENCY,
      successUrl: `${orderUrl}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/event/${event.slug}?cancelled=1`,
    });
    q.run(`UPDATE orders SET payment_ref=? WHERE id=?`, session.id, order.id);
    res.json({ redirect: session.url });
  } catch (e) {
    T.cancelOrder(order.id);
    console.error(e);
    res.status(502).json({ error: "Payment provider error. Please try again." });
  }
}));

app.get("/api/orders/:id", wrap(async (req, res) => {
  let o = T.getOrder(req.params.id);
  if (!o || !req.query.k || o.access_key.length !== String(req.query.k).length ||
      !crypto.timingSafeEqual(Buffer.from(o.access_key), Buffer.from(String(req.query.k)))) {
    return res.status(404).json({ error: "Order not found" });
  }
  // Returning from Stripe: confirm payment directly in case the webhook hasn't arrived yet.
  if (o.status === "pending" && stripe.enabled() && o.payment_ref.startsWith("cs_")) {
    try {
      const s = await stripe.getSession(o.payment_ref);
      if (s.payment_status === "paid") { await completeOrder(o.id, s.payment_intent || s.id, baseUrl(req)); o = T.getOrder(o.id); }
    } catch (e) { console.error(e.message); }
  }
  const e = q.get("SELECT * FROM events WHERE id=?", o.event_id);
  res.json({
    id: o.id, status: o.status, demo: !!o.demo, buyer_name: o.buyer_name, buyer_email: o.buyer_email,
    total_cents: o.total_cents, currency: o.currency, items: o.items.map((i) => ({ name: i.name, qty: i.qty, unit_cents: i.unit_cents })),
    tickets: o.tickets.map((t) => ({ code: t.code, token: t.token, tier: t.tier, holder_name: t.holder_name, status: t.status, checked_in_at: t.checked_in_at })),
    event: publicEvent(e, { tiers: false }), emailed: mail.enabled(),
  });
}));

app.get("/api/tickets/:token", (req, res) => {
  const p = T.parseToken(req.params.token);
  if (!p || !p.signed) return res.status(404).json({ error: "Ticket not found" });
  const t = T.lookupTicket(p.code);
  if (!t) return res.status(404).json({ error: "Ticket not found" });
  const e = q.get("SELECT * FROM events WHERE id=?", t.event_id);
  res.json({ code: t.code, token: T.tokenFor(t.code), tier: t.tier, holder_name: t.holder_name, status: t.status,
    checked_in_at: t.checked_in_at, order_id: t.order_id, event: publicEvent(e, { tiers: false }) });
});

app.get("/api/qr/:token.svg", wrap(async (req, res) => {
  const p = T.parseToken(req.params.token);
  if (!p || !p.signed) return res.status(404).end();
  const svg = await QRCode.toString(`${baseUrl(req)}/t/${T.tokenFor(p.code)}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  res.type("image/svg+xml").set("Cache-Control", "private, max-age=86400").send(svg);
}));

// ---------- blog ----------
function excerptOf(p) {
  if (p.excerpt) return p.excerpt;
  const text = p.body.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#*_>]/g, "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  return text.length > 180 ? text.slice(0, 177).replace(/\s\S*$/, "") + "…" : text;
}
const publicPost = (p, full) => ({ slug: p.slug, title: p.title, excerpt: excerptOf(p), cover: p.cover, tag: p.tag, published_at: p.published_at,
  minutes: Math.max(1, Math.round(p.body.split(/\s+/).length / 220)), ...(full ? { body: p.body } : {}) });

app.get("/api/posts", (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit) || 100);
  res.json(q.all(`SELECT * FROM posts WHERE status='published' ORDER BY published_at DESC, id ASC LIMIT ?`, limit).map((p) => publicPost(p)));
});
app.get("/api/posts/:slug", (req, res) => {
  const p = q.get(`SELECT * FROM posts WHERE slug=? AND status='published'`, req.params.slug);
  if (!p) return res.status(404).json({ error: "Post not found" });
  const all = q.all(`SELECT * FROM posts WHERE status='published' ORDER BY published_at DESC, id ASC`);
  const i = all.findIndex((x) => x.id === p.id);
  res.json({ ...publicPost(p, true), newer: all[i - 1] ? publicPost(all[i - 1]) : null, older: all[i + 1] ? publicPost(all[i + 1]) : null });
});

app.post("/api/bookings", (req, res) => {
  const v = req.body || {};
  if (v._gotcha) return res.json({ ok: true });
  if (!clean(v.name) || !isEmail(clean(v.email)) || !BOOKING.eventTypes[v.type]) return res.status(400).json({ error: "Missing details" });
  const addOns = Array.isArray(v.addOnKeys) ? v.addOnKeys : [];
  const quote = Pricing.calculate(BOOKING, { ...v, addOns }); // recompute: never trust client totals
  const ref = clean(v.reference, 40) || "WN-" + T.randomCode(6);
  const data = { ...v, estimate: quote };
  q.run(`INSERT OR IGNORE INTO bookings (ref, name, email, phone, event_type, event_date, estimate_cents, data) VALUES (?,?,?,?,?,?,?,?)`,
    ref, clean(v.name), clean(v.email), clean(v.phone), BOOKING.eventTypes[v.type].label, clean(v.date, 20), Math.round(quote.total * 100), JSON.stringify(data));
  audience.upsertContact({ email: v.email, name: v.name, phone: v.phone, city: clean(v.location, 60), source: "booking", consent: !!v.optin });
  mail.notifyOwner(`🎧 New booking request ${ref}: ${BOOKING.eventTypes[v.type].label} on ${clean(v.date, 20)}`, clean(v.summary, 8000) || JSON.stringify(data, null, 2));
  res.json({ ok: true, ref });
});

app.post("/api/messages", (req, res) => {
  const b = req.body || {};
  if (b._gotcha) return res.json({ ok: true });
  if (!clean(b.name) || !isEmail(clean(b.email)) || !clean(b.message)) return res.status(400).json({ error: "Please fill in your name, email and message" });
  audience.upsertContact({ email: b.email, name: b.name, source: "contact" });
  q.run(`INSERT INTO messages (name, email, subject, message) VALUES (?,?,?,?)`, clean(b.name), clean(b.email), clean(b.subject), clean(b.message, 5000));
  mail.notifyOwner(`✉️ Website message: ${clean(b.subject) || "(no subject)"}`, `${clean(b.name)} <${clean(b.email)}>\n\n${clean(b.message, 5000)}`);
  res.json({ ok: true });
});

app.post("/api/subscribe", (req, res) => {
  const b = req.body || {};
  if (b._gotcha) return res.json({ ok: true });
  if (!isEmail(clean(b.email))) return res.status(400).json({ error: "Please enter a valid email" });
  audience.upsertContact({ email: b.email, name: b.name, phone: b.phone, city: b.city, source: "signup", consent: true });
  res.json({ ok: true });
});
app.post("/api/unsubscribe", (req, res) => {
  const b = req.body || {};
  audience.unsubscribe(b.e, String(b.t || "")) ? res.json({ ok: true }) : res.status(400).json({ error: "This unsubscribe link isn't valid." });
});
// One-click unsubscribe from email clients (List-Unsubscribe-Post)
app.post("/unsubscribe", express.urlencoded({ extended: false }), (req, res) => {
  audience.unsubscribe(req.query.e, String(req.query.t || "")) ? res.send("Unsubscribed") : res.status(400).send("Invalid link");
});

// ---------- admin ----------
const COOKIE = "wn_admin";
const adminToken = () => crypto.createHmac("sha256", ADMIN_PASSWORD + T.tokenFor("ADMIN")).update("admin-session").digest("base64url");
function isAdmin(req) {
  if (!ADMIN_PASSWORD) return false;
  const c = (req.get("cookie") || "").split(/;\s*/).find((x) => x.startsWith(COOKIE + "="));
  const v = c ? c.slice(COOKIE.length + 1) : "";
  const t = adminToken();
  return v.length === t.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(t));
}
const requireAdmin = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: "Not signed in" }));

const loginAttempts = new Map();
app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: "Set the ADMIN_PASSWORD environment variable on the server first." });
  const ip = req.ip, a = loginAttempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  const pw = String((req.body || {}).password || "");
  const ok = pw.length === ADMIN_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(ADMIN_PASSWORD));
  if (!ok) { a.n++; loginAttempts.set(ip, a); return res.status(401).json({ error: "Wrong password" }); }
  loginAttempts.delete(ip);
  res.set("Set-Cookie", `${COOKIE}=${adminToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${req.secure ? "; Secure" : ""}`);
  res.json({ ok: true });
});
app.post("/api/admin/logout", (req, res) => { res.set("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0`); res.json({ ok: true }); });
app.get("/api/admin/me", (req, res) => res.json({ signedIn: isAdmin(req), configured: !!ADMIN_PASSWORD, demo: DEMO, email: mail.enabled() }));

app.use("/api/admin", requireAdmin);

function eventStats(id) {
  return q.get(`SELECT
      (SELECT COUNT(*) FROM tickets WHERE event_id=? AND status='valid') AS sold,
      (SELECT COUNT(*) FROM tickets WHERE event_id=? AND status='valid' AND checked_in_at IS NOT NULL) AS checked_in,
      (SELECT COALESCE(SUM(total_cents),0) FROM orders WHERE event_id=? AND status='paid' AND demo=0) AS revenue_cents,
      (SELECT COALESCE(SUM(total_cents),0) FROM orders WHERE event_id=? AND status='paid' AND demo=1) AS test_cents,
      (SELECT COUNT(*) FROM orders WHERE event_id=? AND status IN ('paid','comp')) AS orders`, id, id, id, id, id);
}

app.get("/api/admin/summary", (req, res) => {
  res.json({
    events: q.all(`SELECT * FROM events ORDER BY starts_at DESC`).map((e) => ({ ...e, when: formatWhen(e), stats: eventStats(e.id),
      capacity: q.get(`SELECT COALESCE(SUM(quantity),0) n FROM ticket_types WHERE event_id=? AND active=1`, e.id).n })),
    newBookings: q.get(`SELECT COUNT(*) n FROM bookings WHERE status='new'`).n,
    messages: q.get(`SELECT COUNT(*) n FROM messages`).n,
    subscribers: q.get(`SELECT COUNT(*) n FROM contacts WHERE consent_at IS NOT NULL AND unsubscribed_at IS NULL`).n,
    contacts: q.get(`SELECT COUNT(*) n FROM contacts`).n,
  });
});

app.get("/api/admin/events/:id", (req, res) => {
  const e = q.get(`SELECT * FROM events WHERE id=?`, req.params.id);
  if (!e) return res.status(404).json({ error: "Not found" });
  res.json({ ...e, tiers: T.tiersForEvent(e.id, { includeHidden: true }), stats: eventStats(e.id) });
});

function saveEvent(id, b) {
  const f = {
    title: clean(b.title, 140), tagline: clean(b.tagline, 200), description: clean(b.description, 8000),
    starts_at: clean(b.starts_at, 16), ends_at: clean(b.ends_at, 16), venue: clean(b.venue, 140), address: clean(b.address, 200),
    city: clean(b.city, 80), age: clean(b.age, 20), dress_code: clean(b.dress_code, 140), flyer: clean(b.flyer, 300),
    status: ["draft", "published", "cancelled"].includes(b.status) ? b.status : "draft",
  };
  if (!f.title || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(f.starts_at)) throw new T.OrderError("Title and start date/time are required");
  let slug = slugify(b.slug || f.title);
  const clash = q.get(`SELECT id FROM events WHERE slug=? AND id IS NOT ?`, slug, id || null);
  if (clash) slug = `${slug}-${f.starts_at.slice(0, 10)}`;
  if (id) {
    q.run(`UPDATE events SET slug=?, title=?, tagline=?, description=?, starts_at=?, ends_at=?, venue=?, address=?, city=?, age=?, dress_code=?, flyer=?, status=? WHERE id=?`,
      slug, f.title, f.tagline, f.description, f.starts_at, f.ends_at, f.venue, f.address, f.city, f.age, f.dress_code, f.flyer, f.status, id);
  } else {
    id = Number(q.run(`INSERT INTO events (slug, title, tagline, description, starts_at, ends_at, venue, address, city, age, dress_code, flyer, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      slug, f.title, f.tagline, f.description, f.starts_at, f.ends_at, f.venue, f.address, f.city, f.age, f.dress_code, f.flyer, f.status).lastInsertRowid);
  }
  const keep = [];
  (Array.isArray(b.tiers) ? b.tiers : []).forEach((t, i) => {
    const v = [clean(t.name, 80) || "General Admission", clean(t.description, 300), Math.max(0, Math.round(Number(t.price) * 100) || 0),
      Math.max(0, parseInt(t.quantity) || 0), Math.min(50, Math.max(1, parseInt(t.max_per_order) || 10)),
      clean(t.sales_start, 16), clean(t.sales_end, 16), i, t.active === false ? 0 : 1];
    if (t.id && q.get(`SELECT 1 FROM ticket_types WHERE id=? AND event_id=?`, t.id, id)) {
      q.run(`UPDATE ticket_types SET name=?, description=?, price_cents=?, quantity=?, max_per_order=?, sales_start=?, sales_end=?, sort=?, active=? WHERE id=?`, ...v, t.id);
      keep.push(Number(t.id));
    } else {
      keep.push(Number(q.run(`INSERT INTO ticket_types (name, description, price_cents, quantity, max_per_order, sales_start, sales_end, sort, active, event_id) VALUES (?,?,?,?,?,?,?,?,?,?)`, ...v, id).lastInsertRowid));
    }
  });
  // Tiers removed in the editor: delete if unsold, otherwise just hide them.
  for (const t of q.all(`SELECT id FROM ticket_types WHERE event_id=?`, id)) {
    if (keep.includes(t.id)) continue;
    const used = q.get(`SELECT 1 FROM order_items WHERE ticket_type_id=? LIMIT 1`, t.id);
    if (used) q.run(`UPDATE ticket_types SET active=0 WHERE id=?`, t.id); else q.run(`DELETE FROM ticket_types WHERE id=?`, t.id);
  }
  return id;
}
const handleSave = (req, res) => {
  try { res.json({ id: saveEvent(req.params.id ? Number(req.params.id) : null, req.body || {}) }); }
  catch (e) { if (e instanceof T.OrderError) return res.status(400).json({ error: e.message }); throw e; }
};
app.post("/api/admin/events", handleSave);
app.put("/api/admin/events/:id", handleSave);
app.delete("/api/admin/events/:id", (req, res) => {
  if (q.get(`SELECT 1 FROM orders WHERE event_id=? LIMIT 1`, req.params.id)) return res.status(400).json({ error: "This event has orders. Set it to Draft or Cancelled instead." });
  q.run(`DELETE FROM events WHERE id=?`, req.params.id);
  res.json({ ok: true });
});

app.post("/api/admin/upload", (req, res) => {
  const m = String((req.body || {}).dataUrl || "").match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: "Upload a PNG, JPG, WEBP or GIF image" });
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 6 * 1024 * 1024) return res.status(400).json({ error: "Image must be under 6 MB" });
  const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${m[1].replace("jpeg", "jpg")}`;
  fs.writeFileSync(path.join(UPLOADS, name), buf);
  res.json({ url: `/uploads/${name}` });
});

function attendees(eventId) {
  return q.all(`SELECT t.code, t.holder_name, t.status, t.checked_in_at, tt.name AS tier, o.id AS order_id, o.buyer_email, o.buyer_phone,
                       o.status AS order_status, o.demo, o.created_at
                FROM tickets t JOIN ticket_types tt ON tt.id=t.ticket_type_id JOIN orders o ON o.id=t.order_id
                WHERE t.event_id=? ORDER BY o.created_at DESC`, eventId);
}
app.get("/api/admin/events/:id/attendees", (req, res) => res.json(attendees(req.params.id)));
app.get("/api/admin/events/:id/attendees.csv", (req, res) => {
  const rows = attendees(req.params.id);
  const cols = ["code", "holder_name", "tier", "buyer_email", "buyer_phone", "order_id", "status", "checked_in_at", "created_at"];
  const csvCell = (v) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  res.type("text/csv").set("Content-Disposition", `attachment; filename="attendees-${req.params.id}.csv"`)
    .send([cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n"));
});

app.post("/api/admin/comp", wrap(async (req, res) => {
  const b = req.body || {};
  const event = q.get(`SELECT * FROM events WHERE id=?`, b.eventId);
  const tier = event && q.get(`SELECT * FROM ticket_types WHERE id=? AND event_id=?`, b.typeId, event.id);
  const qty = Math.min(50, Math.max(1, parseInt(b.qty) || 1));
  if (!tier) return res.status(400).json({ error: "Pick an event and ticket type" });
  if (!clean(b.name) || !isEmail(clean(b.email))) return res.status(400).json({ error: "Guest name and email are required" });
  const id = "WN" + T.randomCode(8);
  q.run(`INSERT INTO orders (id, event_id, buyer_name, buyer_email, total_cents, currency, access_key, status) VALUES (?,?,?,?,0,?,?, 'pending')`,
    id, event.id, clean(b.name), clean(b.email).toLowerCase(), CURRENCY, T.randomKey());
  q.run(`INSERT INTO order_items VALUES (?,?,?,0)`, id, tier.id, qty);
  await completeOrder(id, "comp", baseUrl(req), { status: "comp" });
  const o = T.getOrder(id);
  res.json({ ok: true, orderUrl: `${baseUrl(req)}/order/${o.id}?k=${o.access_key}`, emailed: mail.enabled() });
}));

app.post("/api/admin/checkin", (req, res) => {
  const r = T.checkIn((req.body || {}).token, { eventId: (req.body || {}).eventId });
  const t = r.ticket;
  res.json({ result: r.result, ticket: t && { code: t.code, holder_name: t.holder_name, tier: t.tier, event_title: t.event_title, checked_in_at: t.checked_in_at } });
});
app.post("/api/admin/tickets/:code/undo-checkin", (req, res) => {
  q.run(`UPDATE tickets SET checked_in_at=NULL WHERE code=?`, req.params.code.toUpperCase());
  res.json({ ok: true });
});
app.post("/api/admin/orders/:id/resend", wrap(async (req, res) => {
  const order = T.getOrder(req.params.id);
  if (!order || !order.tickets.length) return res.status(404).json({ error: "No tickets on this order" });
  const event = q.get(`SELECT * FROM events WHERE id=?`, order.event_id);
  const sent = await mail.sendTickets({ order, event, baseUrl: baseUrl(req), when: formatWhen(event) });
  res.json({ ok: sent, orderUrl: `${baseUrl(req)}/order/${order.id}?k=${order.access_key}`,
    error: sent ? undefined : "Email isn't set up (SMTP). Copy the order link and send it to the guest instead." });
}));
app.post("/api/admin/orders/:id/cancel", (req, res) => { T.cancelOrder(req.params.id); res.json({ ok: true }); });

app.get("/api/admin/posts", (req, res) => res.json(q.all(`SELECT * FROM posts ORDER BY published_at DESC, id ASC`)));
app.get("/api/admin/posts/:id", (req, res) => {
  const p = q.get(`SELECT * FROM posts WHERE id=?`, req.params.id);
  p ? res.json(p) : res.status(404).json({ error: "Not found" });
});
function savePost(req, res) {
  const b = req.body || {}, id = req.params.id ? Number(req.params.id) : null;
  const f = { title: clean(b.title, 160), excerpt: clean(b.excerpt, 400), body: clean(b.body, 50000), cover: clean(b.cover, 300), tag: clean(b.tag, 60),
    published_at: clean(b.published_at, 10), status: b.status === "published" ? "published" : "draft" };
  if (!f.title) return res.status(400).json({ error: "Title is required" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.published_at)) f.published_at = T.nowLocal().slice(0, 10);
  let slug = slugify(b.slug || f.title);
  if (q.get(`SELECT 1 FROM posts WHERE slug=? AND id IS NOT ?`, slug, id)) slug = `${slug}-${f.published_at.slice(0, 4)}`;
  if (q.get(`SELECT 1 FROM posts WHERE slug=? AND id IS NOT ?`, slug, id)) slug = `${slug}-${T.randomCode(4).toLowerCase()}`;
  const vals = [slug, f.title, f.excerpt, f.body, f.cover, f.tag, f.published_at, f.status];
  if (id) { q.run(`UPDATE posts SET slug=?, title=?, excerpt=?, body=?, cover=?, tag=?, published_at=?, status=? WHERE id=?`, ...vals, id); return res.json({ id, slug }); }
  res.json({ id: Number(q.run(`INSERT INTO posts (slug, title, excerpt, body, cover, tag, published_at, status) VALUES (?,?,?,?,?,?,?,?)`, ...vals).lastInsertRowid), slug });
}
app.post("/api/admin/posts", savePost);
app.put("/api/admin/posts/:id", savePost);
app.delete("/api/admin/posts/:id", (req, res) => { q.run(`DELETE FROM posts WHERE id=?`, req.params.id); res.json({ ok: true }); });

app.get("/api/admin/bookings", (req, res) => res.json(q.all(`SELECT * FROM bookings ORDER BY created_at DESC LIMIT 500`).map((b) => ({ ...b, data: JSON.parse(b.data) }))));
app.put("/api/admin/bookings/:id", (req, res) => {
  const s = (req.body || {}).status;
  if (!["new", "quoted", "confirmed", "declined"].includes(s)) return res.status(400).json({ error: "Bad status" });
  q.run(`UPDATE bookings SET status=? WHERE id=?`, s, req.params.id);
  res.json({ ok: true });
});
app.get("/api/admin/messages", (req, res) => res.json(q.all(`SELECT * FROM messages ORDER BY created_at DESC LIMIT 500`)));
const contactRows = () => q.all(`SELECT c.*,
    (SELECT COUNT(*) FROM tickets t JOIN orders o ON o.id=t.order_id WHERE lower(o.buyer_email)=c.email AND t.status='valid') AS tickets
  FROM contacts c ORDER BY c.created_at DESC`);
app.get("/api/admin/contacts", (req, res) => res.json(contactRows()));
app.get("/api/admin/contacts.csv", (req, res) => {
  const cols = ["email", "name", "phone", "city", "source", "tickets", "subscribed", "consent_at", "unsubscribed_at", "created_at"];
  const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const rows = contactRows().map((c) => ({ ...c, subscribed: c.consent_at && !c.unsubscribed_at ? "yes" : "no" }));
  res.type("text/csv").set("Content-Disposition", 'attachment; filename="wild-nation-contacts.csv"')
    .send([cols.join(","), ...rows.map((r) => cols.map((k) => cell(r[k])).join(","))].join("\n"));
});
app.delete("/api/admin/contacts/:email", (req, res) => { q.run(`DELETE FROM contacts WHERE email=?`, req.params.email.toLowerCase()); res.json({ ok: true }); });

function campaignContent(b, base) {
  const event = b.eventId ? q.get(`SELECT * FROM events WHERE id=?`, b.eventId) : null;
  return { subject: clean(b.subject, 160), body: clean(b.body, 20000), event, when: event ? formatWhen(event) : "",
    eventUrl: event ? `${base}/event/${event.slug}` : "", base };
}
function parseAudience(a) {
  a = a || {};
  return ["all", "city", "event"].includes(a.type) ? { type: a.type, value: clean(a.value, 60) } : { type: "all" };
}
app.post("/api/admin/campaigns/count", (req, res) => res.json({ count: audience.recipients(parseAudience((req.body || {}).audience)).length }));
app.post("/api/admin/campaigns/preview", (req, res) => {
  const c = campaignContent(req.body || {}, baseUrl(req));
  res.json({ html: audience.buildMessage(c, { email: "preview@example.com", name: "Alex" }, c.base).html });
});
app.post("/api/admin/campaigns", wrap(async (req, res) => {
  const b = req.body || {}, base = baseUrl(req), c = campaignContent(b, base);
  if (!c.subject || !c.body) return res.status(400).json({ error: "Add a subject and a message" });
  if (!mail.enabled()) return res.status(400).json({ error: "Email isn't set up yet. Add your SMTP settings on the server, then send." });
  if (b.testTo) {
    if (!isEmail(clean(b.testTo))) return res.status(400).json({ error: "Enter an email for the test" });
    const ok = await mail.send(audience.buildMessage({ ...c, subject: "[TEST] " + c.subject }, { email: clean(b.testTo), name: "" }, base));
    return ok ? res.json({ ok: true, test: true }) : res.status(502).json({ error: "The test email failed to send. Check your SMTP settings." });
  }
  const aud = parseAudience(b.audience), list = audience.recipients(aud);
  if (!list.length) return res.status(400).json({ error: "Nobody matches that audience yet" });
  const id = Number(q.run(`INSERT INTO campaigns (subject, body, event_id, audience, total) VALUES (?,?,?,?,?)`,
    c.subject, c.body, c.event ? c.event.id : null, JSON.stringify(aud), list.length).lastInsertRowid);
  audience.runCampaign(id, list, c, base).catch((e) => { console.error(e); q.run(`UPDATE campaigns SET status='failed' WHERE id=?`, id); });
  res.json({ ok: true, id, total: list.length });
}));
app.get("/api/admin/campaigns", (req, res) => res.json(q.all(`SELECT c.*, e.title AS event_title FROM campaigns c LEFT JOIN events e ON e.id=c.event_id ORDER BY c.id DESC LIMIT 100`)));

// ---------- pages ----------
app.use("/uploads", express.static(UPLOADS, { maxAge: "30d" }));
app.get("/event/:slug", (req, res) => res.sendFile(path.join(PUBLIC, "event.html")));
app.get("/blog/:slug", (req, res) => res.sendFile(path.join(PUBLIC, "post.html")));
app.get("/order/:id", (req, res) => res.sendFile(path.join(PUBLIC, "order.html")));
app.get("/t/:token", (req, res) => res.sendFile(path.join(PUBLIC, "ticket.html")));
app.get("/tickets", (req, res) => res.redirect(301, "/events"));
app.use(express.static(PUBLIC, { extensions: ["html"], maxAge: "1h" }));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC, "404.html")));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: "Something went wrong" }); });

if (require.main === module) {
  require("./lib/seed").seedIfEmpty();
  require("./lib/seed").seedPosts();
  app.listen(PORT, () => {
    console.log(`Wild Nation running on http://localhost:${PORT}`);
    if (DEMO) console.log("  TEST MODE: no STRIPE_SECRET_KEY set, checkout issues tickets without taking payment.");
    if (!ADMIN_PASSWORD) console.log("  Set ADMIN_PASSWORD to enable /admin.");
    if (!mail.enabled()) console.log("  Email off: set SMTP_HOST/SMTP_USER/SMTP_PASS to email tickets.");
  });
}
module.exports = app;
