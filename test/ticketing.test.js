// Run with: npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const os = require("os"), fs = require("fs"), path = require("path"), crypto = require("crypto");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "wn-test-"));
process.env.ADMIN_PASSWORD = "pw";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
const app = require("../server");
const T = require("../lib/ticketing");
const { q } = require("../lib/db");
const QRCode = require("qrcode");
const jsQR = require("jsqr");

let base, server, eventId, gaId, vipId;
const post = (u, body, headers = {}) => fetch(base + u, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

before(async () => {
  eventId = Number(q.run(`INSERT INTO events (slug,title,starts_at,status) VALUES ('t','Test','2099-01-01T22:00','published')`).lastInsertRowid);
  gaId = Number(q.run(`INSERT INTO ticket_types (event_id,name,price_cents,quantity) VALUES (?,?,?,?)`, eventId, "GA", 2000, 5).lastInsertRowid);
  vipId = Number(q.run(`INSERT INTO ticket_types (event_id,name,price_cents,quantity,max_per_order) VALUES (?,?,?,?,?)`, eventId, "VIP", 9000, 2, 1).lastInsertRowid);
  await new Promise((r) => { server = app.listen(0, r); });
  base = "http://localhost:" + server.address().port;
});
after(() => { server.closeAllConnections(); server.close(); });

test("checkout issues signed tickets and never oversells", async () => {
  let r = await post("/api/orders", { event: "t", items: { [gaId]: 3 }, name: "A", email: "a@x.co" });
  assert.equal(r.status, 200);
  r = await post("/api/orders", { event: "t", items: { [gaId]: 3 }, name: "B", email: "b@x.co" });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /Only 2/);
  r = await post("/api/orders", { event: "t", items: { [vipId]: 2 }, name: "C", email: "c@x.co" });
  assert.match((await r.json()).error, /Max 1/);
  assert.equal(q.get(`SELECT COUNT(*) n FROM tickets WHERE ticket_type_id=?`, gaId).n, 3);
});

test("forged or tampered tickets are rejected", () => {
  const t = q.get(`SELECT code FROM tickets LIMIT 1`);
  assert.ok(T.parseToken(T.tokenFor(t.code)).signed);
  assert.equal(T.parseToken(t.code + ".AAAAAAAAAAAA"), null);
  assert.equal(T.parseToken("ZZZZZZZZZZ." + T.tokenFor(t.code).split(".")[1]), null);
});

test("QR code decodes to a token the scanner accepts, once", async () => {
  const t = q.get(`SELECT code FROM tickets WHERE checked_in_at IS NULL LIMIT 1`);
  const url = `https://wild.example/t/${T.tokenFor(t.code)}`;
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const size = qr.modules.size, scale = 6, pad = 4 * scale, w = size * scale + pad * 2;
  const px = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (qr.modules.get(y, x))
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = ((pad + y * scale + dy) * w + pad + x * scale + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 0;
    }
  const decoded = jsQR(px, w, w);
  assert.equal(decoded.data, url);
  assert.equal(T.checkIn(decoded.data).result, "ok");
  assert.equal(T.checkIn(decoded.data).result, "already");
  assert.equal(T.checkIn(decoded.data, { eventId: eventId + 1 }).result, "wrong_event");
});

test("cancelled orders void their tickets", () => {
  const o = q.get(`SELECT order_id FROM tickets WHERE checked_in_at IS NULL LIMIT 1`);
  const code = q.get(`SELECT code FROM tickets WHERE order_id=? LIMIT 1`, o.order_id).code;
  T.cancelOrder(o.order_id);
  assert.equal(T.checkIn(T.tokenFor(code)).result, "void");
});

test("stripe webhook requires a valid signature and fulfils the order", async () => {
  const order = T.createOrder({ event: { id: eventId }, items: { [vipId]: 1 }, name: "S", email: "s@x.co", currency: "CAD" });
  const body = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: order.id } } } });
  let r = await fetch(base + "/api/stripe/webhook", { method: "POST", body, headers: { "stripe-signature": "t=1,v1=bad" } });
  assert.equal(r.status, 400);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
  r = await fetch(base + "/api/stripe/webhook", { method: "POST", body, headers: { "stripe-signature": `t=${t},v1=${sig}` } });
  assert.equal(r.status, 200);
  assert.equal(T.getOrder(order.id).status, "paid");
  assert.equal(T.getOrder(order.id).tickets.length, 1);
});

test("order page needs the secret key; admin API needs sign-in", async () => {
  const o = q.get(`SELECT id, access_key FROM orders WHERE status='paid' LIMIT 1`);
  assert.equal((await fetch(`${base}/api/orders/${o.id}?k=wrong`)).status, 404);
  assert.equal((await fetch(`${base}/api/orders/${o.id}?k=${o.access_key}`)).status, 200);
  assert.equal((await fetch(base + "/api/admin/summary")).status, 401);
  const login = await post("/api/admin/login", { password: "pw" });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(base + "/api/admin/summary", { headers: { cookie } })).status, 200);
});

test("DJ quote: rates by event type, travel, minimums, crowd, referral %", async () => {
  const C = require("../public/assets/js/booking-config.js"), P = require("../public/assets/js/pricing.js");
  const H = "Hamilton (incl. Stoney Creek, Ancaster, Dundas, Waterdown)";
  const quote = (type, city, extra = {}) => P.calculate(C, { type, hours: 4, city, ...extra });
  // rates per event type
  assert.equal(quote("private", H).total, 360);           // $90/hr home events
  assert.equal(quote("club", H).total, 400);              // $100/hr paid events
  assert.equal(quote("corporate", H).total, 500);         // $125/hr
  assert.equal(quote("wedding", H, { hours: 6 }).total, 900); // $125/hr + $150 planning
  assert.equal(quote("production", H).customType, true);  // custom quote
  // travel
  assert.equal(quote("private", "St. Catharines").travel.charge, 25);
  assert.equal(quote("private", "Toronto: Downtown / Midtown").travel.charge, 50);
  assert.equal(quote("private", "Somewhere else").custom, true);
  // minimums
  assert.equal(quote("private", H, { hours: 2 }).total, 200);
  assert.equal(quote("private", "St. Catharines", { hours: 2 }).total, 250);
  assert.equal(quote("club", "Toronto: Downtown / Midtown", { hours: 2 }).total, 250);
  // referral: 15% off DJ time in $5 steps, never below $75/hr or the minimum; no referral discount on club gigs
  assert.equal(quote("private", H, { referral: "Kemi" }).total, 310);
  assert.equal(quote("wedding", H, { hours: 6, referral: "Kemi" }).total, 790);
  assert.equal(quote("club", H, { referral: "Kemi" }).total, 400);
  assert.equal(quote("private", H, { hours: 2, referral: "x" }).total, 200);
  assert.equal(quote("private", H, { discountPct: 25 }).total, 300, "capped at $75/hr");
  assert.equal(quote("birthday", H, { rate: 100, discountPct: 25 }).total, 300);
  // crowd decides the speakers; venue sound skips it; more equipment, more money
  assert.equal(quote("club", H, { guests: 150 }).total, 450);
  assert.equal(quote("club", H, { guests: 250 }).total, 500);
  assert.equal(quote("club", H, { guests: 150, venueSound: "yes" }).total, 400);
  assert.equal(quote("club", H, { extras: ["Lighting"], mics: 1 }).total, 475);
  assert.equal(quote("club", H, { mics: 2 }).total, 450);

  const r = await post("/api/bookings", { name: "X Client", email: "x@x.co", phone: "905", type: "private", hours: "4", city: "St. Catharines", guests: "80", date: "2099-03-03", referral: "Kemi" });
  assert.equal(r.status, 200);
  const b = q.get(`SELECT estimate_cents, data FROM bookings ORDER BY id DESC LIMIT 1`);
  assert.equal(b.estimate_cents, 33500); // 360 + 25 travel − 50 referral
});

test("booking contract: send, client signs, deposit, paid in full", async () => {
  const cookie = (await post("/api/admin/login", { password: "pw" })).headers.get("set-cookie").split(";")[0];
  const b = q.get(`SELECT * FROM bookings ORDER BY id DESC LIMIT 1`);
  let r = await post(`/api/admin/bookings/${b.id}/preview`, { hours: 4, rate: 90, discountPct: 15, deposit: 100, adjustments: [{ label: "Ceremony audio", amount: 50 }] }, { cookie });
  const pv = await r.json();
  assert.equal(pv.grandTotal, 385); // 360 + 25 travel + 50 ceremony − 50 discount
  assert.equal(pv.balance, 285);
  r = await post(`/api/admin/bookings/${b.id}/send-contract`, { hours: 4, rate: 90, discountPct: 15, deposit: 100, endTime: "23:00", adjustments: [{ label: "Ceremony audio", amount: 50 }] }, { cookie });
  const sent = await r.json();
  assert.match(sent.invoiceNo, /^INV-\d{4}-\d{4}$/);
  const url = new URL(sent.link);
  const k = url.searchParams.get("k"), ref = url.pathname.split("/").pop();
  assert.equal((await fetch(`${base}/api/booking/${ref}?k=wrong`)).status, 404);
  const view = await (await fetch(`${base}/api/booking/${ref}?k=${k}`)).json();
  assert.equal(view.final.grandTotal, 385);
  assert.ok(view.final.terms.some(([t]) => /Cancellation by the Client/.test(t)));
  assert.ok(view.final.terms.some(([t]) => /Date or time changes/.test(t)));
  assert.equal((await post(`/api/booking/${ref}/sign`, { k, name: "X Client" })).status, 400, "must tick agree");
  assert.equal((await post(`/api/booking/${ref}/sign`, { k, name: "X Client", agree: true })).status, 200);
  assert.equal(q.get(`SELECT status FROM bookings WHERE id=?`, b.id).status, "signed");
  assert.equal((await post(`/api/admin/bookings/${b.id}/send-contract`, { rate: 50 }, { cookie })).status, 400, "signed contracts can't be changed");
  await post(`/api/admin/bookings/${b.id}/deposit-received`, {}, { cookie });
  assert.equal(q.get(`SELECT status FROM bookings WHERE id=?`, b.id).status, "confirmed");
  await post(`/api/admin/bookings/${b.id}/paid-in-full`, {}, { cookie });
  const done = await (await fetch(`${base}/api/booking/${ref}?k=${k}`)).json();
  assert.equal(done.status, "paid"); assert.ok(done.paidAt && done.depositPaidAt && done.signedAt);
});

test("blog: drafts are hidden, posts need admin to create", async () => {
  require("../lib/seed").seedPosts();
  const list = await (await fetch(base + "/api/posts")).json();
  assert.equal(list.length, 9);
  assert.ok(list[0].excerpt.length > 0);
  assert.equal((await post("/api/admin/posts", { title: "x" })).status, 401);
  const cookie = (await post("/api/admin/login", { password: "pw" })).headers.get("set-cookie").split(";")[0];
  let r = await post("/api/admin/posts", { title: "Secret draft", body: "hi", status: "draft" }, { cookie });
  const { slug } = await r.json();
  assert.equal((await fetch(base + "/api/posts/" + slug)).status, 404);
  r = await post("/api/admin/posts", { title: "Secret draft", body: "hello world", status: "published", published_at: "2099-01-01" }, { cookie });
  const pub = await r.json();
  assert.notEqual(pub.slug, slug); // unique slugs
  const got = await (await fetch(base + "/api/posts/" + pub.slug)).json();
  assert.equal(got.body, "hello world");
  assert.equal(got.older.slug, list[0].slug);
});

test("mailing list: opt-in, details saved, unsubscribe", async () => {
  const audience = require("../lib/audience");
  assert.equal((await post("/api/subscribe", { name: "Tobi", email: "Tobi@X.co", phone: "905", city: "Hamilton" })).status, 200);
  await post("/api/orders", { event: "t", items: { [gaId]: 1 }, name: "Buyer", email: "buyer@x.co", phone: "416" });
  await post("/api/orders", { event: "t", items: { [gaId]: 1 }, name: "No Thanks", email: "noopt@x.co", phone: "416", noUpdates: true });
  const tobi = q.get(`SELECT * FROM contacts WHERE email='tobi@x.co'`);
  assert.equal(tobi.phone, "905"); assert.ok(tobi.consent_at);
  const all = audience.recipients({ type: "all" }).map((r) => r.email);
  assert.ok(all.includes("tobi@x.co"));
  assert.ok(all.includes("buyer@x.co"), "buyers are on the list by default (CASL implied consent)");
  assert.ok(!all.includes("noopt@x.co"), "buyers who ticked 'No thanks' are not");
  const until = q.get(`SELECT implied_until FROM contacts WHERE email='buyer@x.co'`).implied_until;
  assert.equal(until.slice(0, 4), String(new Date().getFullYear() + 2), "implied consent lasts 2 years from purchase");
  assert.equal(q.get(`SELECT phone FROM contacts WHERE email='noopt@x.co'`).phone, "416", "details are saved even when they opt out");
  assert.deepEqual(audience.recipients({ type: "city", value: "hamilton" }).map((r) => r.email), ["tobi@x.co"]);
  const url = new URL(audience.unsubUrl("http://x", "tobi@x.co"));
  assert.equal((await post("/api/unsubscribe", { e: "tobi@x.co", t: "forged" })).status, 400);
  assert.equal((await post("/api/unsubscribe", { e: url.searchParams.get("e"), t: url.searchParams.get("t") })).status, 200);
  assert.ok(!audience.recipients({ type: "all" }).some((r) => r.email === "tobi@x.co"));
  // signing up again re-subscribes
  await post("/api/subscribe", { email: "tobi@x.co" });
  assert.ok(audience.recipients({ type: "all" }).some((r) => r.email === "tobi@x.co"));
});

test("blog: publishing with 'notify' emails the list once, video posts get a thumbnail", async () => {
  const cookie = (await post("/api/admin/login", { password: "pw" })).headers.get("set-cookie").split(";")[0];
  const body = "New mix video!\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const r = await (await post("/api/admin/posts", { title: "Vid", body, status: "published", notify: true }, { cookie })).json();
  assert.match(r.notify.error, /email isn't set up/i); // no SMTP in tests: post still saved
  const got = await (await fetch(base + "/api/posts/" + r.slug)).json();
  assert.equal(got.media, "video");
  assert.equal(got.cover, "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  const seeded = q.get(`SELECT notified_at FROM posts WHERE slug='euphoria-2022'`);
  assert.ok(seeded.notified_at, "old recaps are marked as already announced");
});
