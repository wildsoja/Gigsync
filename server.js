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
const contract = require("./lib/contract");
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

  audience.upsertContact({ email, name, phone, source: "ticket", impliedMonths: 24, optOut: !!b.noUpdates });
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
// First YouTube video in a post: used for the thumbnail when there's no cover image.
const ytId = (body) => { const m = String(body || "").match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/); return m && m[1]; };
const MEDIA_RE = /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch|shorts)|youtu\.be\/|soundcloud\.com\/|(?:www\.)?mixcloud\.com\/|open\.spotify\.com\/)/m;
const postCover = (p) => p.cover || (ytId(p.body) ? `https://i.ytimg.com/vi/${ytId(p.body)}/hqdefault.jpg` : "");
const publicPost = (p, full) => ({ slug: p.slug, title: p.title, excerpt: excerptOf(p), cover: postCover(p), tag: p.tag, published_at: p.published_at,
  media: MEDIA_RE.test(p.body) ? (ytId(p.body) ? "video" : "audio") : "",
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
  const b = req.body || {};
  if (b._gotcha) return res.json({ ok: true });
  if (!clean(b.name) || !isEmail(clean(b.email)) || !BOOKING.eventTypes[b.type]) return res.status(400).json({ error: "Please fill in your name, email and event type" });
  const cities = BOOKING.travel.cities.map((c) => c.name);
  const v = {
    type: b.type, date: clean(b.date, 10), startTime: clean(b.startTime, 5), hours: clean(b.hours, 3), guests: clean(b.guests, 6),
    guestRange: (BOOKING.guestRanges.find((g) => String(g.value) === String(b.guests)) || {}).label || "",
    venueSound: ["yes", "no", "unsure"].includes(b.venueSound) ? b.venueSound : "unsure",
    mics: String((BOOKING.mics.find((m) => String(m.count) === String(b.mics)) || { count: 0 }).count),
    city: cities.includes(b.city) ? b.city : "", location: clean(b.location, 200), venue: clean(b.venue, 200),
    extras: (Array.isArray(b.extras) ? b.extras : []).filter((x) => BOOKING.extras.some((e) => e.name === x)),
    name: clean(b.name, 120), phone: clean(b.phone, 40), email: clean(b.email, 200), contactPref: clean(b.contactPref, 20),
    referral: clean(b.referral, 120), notes: clean(b.notes, 4000),
  };
  const quote = Pricing.calculate(BOOKING, v); // suggested quote, only shown to you
  const ref = "WS-" + T.randomCode(6);
  const label = BOOKING.eventTypes[v.type].label;
  q.run(`INSERT INTO bookings (ref, name, email, phone, event_type, event_date, estimate_cents, data) VALUES (?,?,?,?,?,?,?,?)`,
    ref, v.name, v.email, v.phone, label, v.date, Math.round(quote.total * 100), JSON.stringify({ ...v, estimate: quote }));
  audience.upsertContact({ email: v.email, name: v.name, phone: v.phone, source: "booking", impliedMonths: 6, optOut: !!b.noUpdates });
  const where = v.city && !quote.custom ? v.city : v.location || v.city || "?";
  mail.notifyOwner(`🎧 Booking request: ${label}, ${v.date}, ${where}`, [
    `${v.name} · ${v.phone} · ${v.email} (prefers ${v.contactPref || "any"})`,
    `${label} on ${v.date}${v.startTime ? " at " + v.startTime : ""}, ${quote.hours} hrs, ${v.guestRange || "?"} guests`,
    `Where: ${where}${v.venue ? " · " + v.venue : ""} · venue sound: ${v.venueSound}`,
    `Mics: ${v.mics}${v.extras.length ? ` · Extras: ${v.extras.join(", ")}` : ""}`,
    v.referral ? `Referred by: ${v.referral}` : "",
    v.notes ? `Notes: ${v.notes}` : "",
    "",
    "SUGGESTED QUOTE",
    ...quote.lines.map((l) => `${l.label}: $${l.amount}`),
    quote.customType ? "Total: custom quote (build it in /admin)"
      : `Total: $${quote.total}${quote.custom ? " + travel (quote it yourself)" : ""}${quote.minApplied ? ` (minimum $${quote.minimum} applied)` : ""}${quote.discount ? ` (full price $${quote.fullPrice})` : ""}`,
    quote.referred && !quote.discount && !quote.customType ? "Referred, but no discount applies (club rate or already at the minimum)" : "",
    "",
    `Ref ${ref}. Hit reply to answer ${v.name.split(" ")[0]} directly, or use /admin → DJ bookings.`,
  ].filter((x) => x !== "").join("\n"), { to: mail.bookingsInbox(), replyTo: v.email });
  // The client sees this on the confirmation screen (unless showEstimate is "never").
  const estimate = BOOKING.showEstimate === "never" ? null
    : { total: quote.total, customType: !!quote.customType, travelTbc: !!quote.custom, discount: quote.discount, discountPct: quote.discountPct, hours: quote.hours };
  res.json({ ok: true, ref, estimate });
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
    subscribers: q.get(`SELECT COUNT(*) n FROM contacts WHERE ${audience.ON_LIST}`).n,
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
  audience.upsertContact({ email: b.email, name: b.name, source: "comp" }); // saved, but a free ticket isn't consent to marketing
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
  let postId = id;
  if (id) q.run(`UPDATE posts SET slug=?, title=?, excerpt=?, body=?, cover=?, tag=?, published_at=?, status=? WHERE id=?`, ...vals, id);
  else postId = Number(q.run(`INSERT INTO posts (slug, title, excerpt, body, cover, tag, published_at, status) VALUES (?,?,?,?,?,?,?,?)`, ...vals).lastInsertRowid);
  const out = { id: postId, slug };
  if (b.notify && f.status === "published") out.notify = notifyPost(postId, baseUrl(req));
  res.json(out);
}

/** Email the mailing list about a newly published post (once per post). */
function notifyPost(id, base) {
  const p = q.get(`SELECT * FROM posts WHERE id=?`, id);
  if (!p || p.notified_at) return { skipped: "already sent" };
  if (!mail.enabled()) return { error: "Post saved, but email isn't set up yet, so the mailing list wasn't notified." };
  const list = audience.recipients({ type: "all" });
  if (!list.length) return { error: "Post saved. Nobody is on the mailing list yet." };
  const pp = publicPost(p);
  const label = pp.media === "video" ? "Watch now" : pp.media === "audio" ? "Listen now" : "Read more";
  const kind = pp.media === "video" ? "New video" : pp.media === "audio" ? "New mix" : "New on the blog";
  const c = { subject: `${kind}: ${p.title}`, body: pp.excerpt, base, post: { title: p.title, image: pp.cover, url: `${base}/blog/${p.slug}`, label } };
  const cid = Number(q.run(`INSERT INTO campaigns (subject, body, audience, total) VALUES (?,?,?,?)`, c.subject, c.body, JSON.stringify({ type: "post", value: p.slug }), list.length).lastInsertRowid);
  q.run(`UPDATE posts SET notified_at=datetime('now') WHERE id=?`, id);
  audience.runCampaign(cid, list, c, base).catch((e) => { console.error(e); q.run(`UPDATE campaigns SET status='failed' WHERE id=?`, cid); });
  return { sent: list.length };
}
app.post("/api/admin/posts", savePost);
app.put("/api/admin/posts/:id", savePost);
app.delete("/api/admin/posts/:id", (req, res) => { q.run(`DELETE FROM posts WHERE id=?`, req.params.id); res.json({ ok: true }); });

app.get("/api/admin/bookings", (req, res) => res.json(q.all(`SELECT * FROM bookings ORDER BY created_at DESC LIMIT 500`)
  .map((b) => ({ ...b, data: JSON.parse(b.data), final: b.final ? JSON.parse(b.final) : null, link: b.token ? `${baseUrl(req)}/booking/${b.ref}?k=${b.token}` : null }))));

// ---- DJ booking contract & invoice ----
const BOOKING_STATUSES = ["new", "quoted", "contract_sent", "signed", "confirmed", "paid", "declined", "cancelled"];
const bookingLink = (req, b) => `${baseUrl(req)}/booking/${b.ref}?k=${b.token}`;
function fmtEventDate(d) { return d ? new Date(d + "T12:00:00").toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "Date TBC"; }
function fmtTime(t) { if (!t) return ""; const [h, m] = t.split(":").map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }); }
const loadFinal = (b) => ({ ...JSON.parse(b.final), depositPaidAt: b.deposit_paid_at, paidAt: b.paid_at, signedAt: b.signed_at });

// Preview or send: build the final invoice from the request + your adjustments.
function buildFinal(b, body) {
  const data = JSON.parse(b.data);
  const o = body || {};
  const v = { ...data, hours: o.hours ?? data.hours, venue: o.venue ?? data.venue, startTime: o.startTime ?? data.startTime,
    rate: o.rate === "" || o.rate == null ? undefined : Number(o.rate), discountPct: o.discountPct === "" || o.discountPct == null ? undefined : Number(o.discountPct),
    travelCharge: o.travelCharge === "" || o.travelCharge == null ? undefined : Number(o.travelCharge),
    adjustments: (Array.isArray(o.adjustments) ? o.adjustments : []).slice(0, 10).map((a) => ({ label: clean(a.label, 80), amount: Number(a.amount) || 0 })) };
  const qt = Pricing.calculate(BOOKING, v);
  if (qt.customType) throw new T.OrderError("Set an hourly rate for this custom booking first");
  const deposit = Math.min(qt.grandTotal, Math.max(0, o.deposit === "" || o.deposit == null ? BOOKING.deposit : Number(o.deposit)));
  const endTime = clean(o.endTime, 5);
  const f = {
    lines: qt.lines, total: qt.total, hst: qt.hst, grandTotal: qt.grandTotal, deposit, balance: Math.round((qt.grandTotal - deposit) * 100) / 100,
    rate: qt.rate, hours: qt.hours, discountPct: qt.discountPct, startTime: v.startTime || "", endTime,
    dateText: fmtEventDate(data.date), timeText: [fmtTime(v.startTime), fmtTime(endTime)].filter(Boolean).join(" – ") + (v.startTime ? ` (${qt.hours} hrs)` : ""),
    whereText: [v.venue, data.city && !/else/i.test(data.city) ? data.city.split(" (")[0] : data.location].filter(Boolean).join(", ") || "Location TBC",
    services: [qt.sound.label, ...(data.mics && data.mics !== "0" ? [`${data.mics} microphone${data.mics === "1" ? "" : "s"}`] : []), ...(data.extras || [])],
    notes: clean(o.notes, 1000),
  };
  return f;
}

app.post("/api/admin/bookings/:id/preview", (req, res) => {
  const b = q.get(`SELECT * FROM bookings WHERE id=?`, req.params.id);
  if (!b) return res.status(404).json({ error: "Not found" });
  try { res.json(buildFinal(b, req.body)); } catch (e) { if (e instanceof T.OrderError) return res.status(400).json({ error: e.message }); throw e; }
});

app.post("/api/admin/bookings/:id/send-contract", wrap(async (req, res) => {
  const b = q.get(`SELECT * FROM bookings WHERE id=?`, req.params.id);
  if (!b) return res.status(404).json({ error: "Not found" });
  let f;
  try { f = buildFinal(b, req.body); } catch (e) { if (e instanceof T.OrderError) return res.status(400).json({ error: e.message }); throw e; }
  if (b.signed_at) return res.status(400).json({ error: "This contract is already signed. Cancel it and create a new booking to change the terms." });
  f.invoiceNo = b.invoice_no || contract.nextInvoiceNo();
  f.terms = contract.terms(f); // frozen: the client signs exactly this text
  f.issuedAt = new Date().toISOString();
  const token = b.token || contract.newToken();
  q.run(`UPDATE bookings SET final=?, invoice_no=?, token=?, contract_sent_at=datetime('now'), status='contract_sent', estimate_cents=? WHERE id=?`,
    JSON.stringify(f), f.invoiceNo, token, Math.round(f.grandTotal * 100), b.id);
  const fresh = q.get(`SELECT * FROM bookings WHERE id=?`, b.id), link = bookingLink(req, fresh);
  const m = contract.contractEmail(fresh, f, link, baseUrl(req));
  const emailed = await mail.send({ to: b.email, replyTo: mail.bookingsInbox(), bcc: mail.bookingsInbox(), ...m });
  res.json({ ok: true, link, emailed, invoiceNo: f.invoiceNo });
}));

async function markPaid(req, res, kind) {
  const b = q.get(`SELECT * FROM bookings WHERE id=?`, req.params.id);
  if (!b || !b.final) return res.status(400).json({ error: "Send the contract first" });
  if (kind === "deposit") q.run(`UPDATE bookings SET deposit_paid_at=COALESCE(deposit_paid_at, datetime('now')), status=CASE WHEN paid_at IS NULL THEN 'confirmed' ELSE status END WHERE id=?`, b.id);
  else q.run(`UPDATE bookings SET deposit_paid_at=COALESCE(deposit_paid_at, datetime('now')), paid_at=COALESCE(paid_at, datetime('now')), status='paid' WHERE id=?`, b.id);
  const fresh = q.get(`SELECT * FROM bookings WHERE id=?`, b.id);
  const emailed = req.body && req.body.notify === false ? false
    : await mail.send({ to: b.email, replyTo: mail.bookingsInbox(), ...contract.receiptEmail(fresh, loadFinal(fresh), bookingLink(req, fresh), baseUrl(req), kind) });
  res.json({ ok: true, emailed });
}
app.post("/api/admin/bookings/:id/deposit-received", wrap((req, res) => markPaid(req, res, "deposit")));
app.post("/api/admin/bookings/:id/paid-in-full", wrap((req, res) => markPaid(req, res, "paid")));

// Client-facing booking page (contract + invoice), protected by the secret link.
function bookingForToken(ref, k) {
  const b = q.get(`SELECT * FROM bookings WHERE ref=?`, String(ref));
  if (!b || !b.token || !k || b.token.length !== String(k).length || !crypto.timingSafeEqual(Buffer.from(b.token), Buffer.from(String(k)))) return null;
  return b;
}
app.get("/api/booking/:ref", (req, res) => {
  const b = bookingForToken(req.params.ref, req.query.k);
  if (!b || !b.final) return res.status(404).json({ error: "Booking not found" });
  const f = loadFinal(b);
  res.json({ ref: b.ref, name: b.name, email: b.email, phone: b.phone, eventType: b.event_type, status: b.status, final: f,
    signedName: b.signed_name, signedAt: b.signed_at, depositPaidAt: b.deposit_paid_at, paidAt: b.paid_at,
    business: { name: BOOKING.contract.businessName, email: BOOKING.bookingEmail, phone: BOOKING.brand.phone, city: BOOKING.contract.city, hst: BOOKING.contract.hst } });
});
app.post("/api/booking/:ref/sign", wrap(async (req, res) => {
  const b = bookingForToken(req.params.ref, (req.body || {}).k);
  if (!b || !b.final) return res.status(404).json({ error: "Booking not found" });
  if (b.signed_at) return res.json({ ok: true, already: true });
  const name = clean((req.body || {}).name, 120);
  if (name.length < 2 || !(req.body || {}).agree) return res.status(400).json({ error: "Type your full name and tick the box to accept" });
  if (["cancelled", "declined"].includes(b.status)) return res.status(400).json({ error: "This booking is no longer active. Please contact us." });
  q.run(`UPDATE bookings SET signed_at=datetime('now'), signed_name=?, signed_ip=?, status=CASE WHEN deposit_paid_at IS NULL THEN 'signed' ELSE status END WHERE id=?`,
    name, req.ip, b.id);
  const fresh = q.get(`SELECT * FROM bookings WHERE id=?`, b.id), f = loadFinal(fresh), link = bookingLink(req, fresh);
  mail.send({ to: b.email, replyTo: mail.bookingsInbox(), ...contract.signedEmail(fresh, f, link, baseUrl(req)) });
  mail.notifyOwner(`✍️ Contract signed: ${b.name}, ${b.event_type} (${f.invoiceNo})`,
    `${name} accepted the contract for ${f.dateText}.\nTotal ${contract.money(f.grandTotal)}, deposit ${contract.money(f.deposit)} ${fresh.deposit_paid_at ? "received" : "not received yet: watch for the e-Transfer"}.\n${link}`,
    { to: mail.bookingsInbox() });
  res.json({ ok: true });
}));

app.put("/api/admin/bookings/:id", (req, res) => {
  const s = (req.body || {}).status;
  if (!BOOKING_STATUSES.includes(s)) return res.status(400).json({ error: "Bad status" });
  q.run(`UPDATE bookings SET status=? WHERE id=?`, s, req.params.id);
  res.json({ ok: true });
});
app.get("/api/admin/messages", (req, res) => res.json(q.all(`SELECT * FROM messages ORDER BY created_at DESC LIMIT 500`)));
const contactRows = () => q.all(`SELECT c.*,
    (SELECT COUNT(*) FROM tickets t JOIN orders o ON o.id=t.order_id WHERE lower(o.buyer_email)=c.email AND t.status='valid') AS tickets,
    (SELECT COUNT(DISTINCT t.event_id) FROM tickets t JOIN orders o ON o.id=t.order_id WHERE lower(o.buyer_email)=c.email AND t.checked_in_at IS NOT NULL) AS attended,
    (SELECT MAX(o.created_at) FROM orders o WHERE lower(o.buyer_email)=c.email AND o.status IN ('paid','comp')) AS last_purchase,
    CASE WHEN ${audience.ON_LIST} THEN 1 ELSE 0 END AS on_list
  FROM contacts c ORDER BY c.updated_at DESC`);
app.get("/api/admin/contacts", (req, res) => res.json(contactRows()));
app.get("/api/admin/contacts.csv", (req, res) => {
  const cols = ["email", "name", "phone", "city", "source", "tickets", "attended", "last_purchase", "on_mailing_list", "signed_up_at", "customer_until", "unsubscribed_at", "created_at"];
  const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const rows = contactRows().map((c) => ({ ...c, on_mailing_list: c.on_list ? "yes" : "no", signed_up_at: c.consent_at, customer_until: c.implied_until }));
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
// Pages use relative asset paths (so they also open straight from disk). On nested
// URLs like /blog/my-post those resolve to /blog/assets/..., so serve them from public/.
app.get(/^\/(?:[^/]+\/)+?(assets|img|vendor)\/(.+)$/, (req, res, next) => {
  const [, dir, rest] = req.path.match(/^\/(?:[^/]+\/)+?(assets|img|vendor)\/(.+)$/);
  res.sendFile(rest, { root: path.join(PUBLIC, dir), maxAge: "1h", dotfiles: "deny" }, (err) => err && next());
});
app.get("/blog/:slug", (req, res) => res.sendFile(path.join(PUBLIC, "post.html")));
app.get("/order/:id", (req, res) => res.sendFile(path.join(PUBLIC, "order.html")));
app.get("/booking/:ref", (req, res) => res.sendFile(path.join(PUBLIC, "booking.html")));
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
