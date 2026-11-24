// Minimal Stripe Checkout client using fetch (no SDK needed).
const crypto = require("crypto");
const KEY = process.env.STRIPE_SECRET_KEY || "";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

const enabled = () => !!KEY;

function encode(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") encode(v, key, out);
    else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(v));
  }
  return out.join("&");
}

async function api(method, path, body) {
  const r = await fetch("https://api.stripe.com/v1" + path, {
    method,
    headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/x-www-form-urlencoded" },
    body: body ? encode(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Stripe: " + (j.error && j.error.message || r.status));
  return j;
}

function createCheckout({ order, event, currency, successUrl, cancelUrl }) {
  const line_items = {};
  order.items.forEach((it, i) => {
    line_items[i] = {
      quantity: it.qty,
      price_data: { currency: currency.toLowerCase(), unit_amount: it.unit_cents,
        product_data: { name: `${event.title}: ${it.name}` } },
    };
  });
  return api("POST", "/checkout/sessions", {
    mode: "payment",
    line_items,
    customer_email: order.buyer_email,
    client_reference_id: order.id,
    metadata: { order_id: order.id },
    success_url: successUrl,
    cancel_url: cancelUrl,
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60, // Stripe minimum is 30 min
  });
}

const getSession = (id) => api("GET", "/checkout/sessions/" + encodeURIComponent(id));

/** Verify a webhook signature (Stripe-Signature header). Returns parsed event or throws. */
function verifyWebhook(rawBody, header) {
  if (!WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET not set");
  const parts = Object.fromEntries(String(header || "").split(",").map((p) => p.split("=")));
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(`${parts.t}.${rawBody}`).digest("hex");
  if (!parts.v1 || parts.v1.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected))) throw new Error("Bad signature");
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) throw new Error("Stale webhook");
  return JSON.parse(rawBody);
}

module.exports = { enabled, createCheckout, getSession, verifyWebhook };
