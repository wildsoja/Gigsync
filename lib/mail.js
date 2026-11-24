// Email via any SMTP provider (Gmail app password, Resend, SendGrid, Brevo...). Optional.
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");

const enabled = () => !!process.env.SMTP_HOST;
let transport;
function getTransport() {
  if (!transport) transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}
const FROM = () => process.env.MAIL_FROM || process.env.SMTP_USER || "Wild Nation <no-reply@localhost>";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function send(msg) {
  if (!enabled()) { console.log(`[mail] SMTP not configured, skipped: "${msg.subject}" -> ${msg.to}`); return false; }
  try { await getTransport().sendMail({ from: FROM(), ...msg }); return true; }
  catch (e) { console.error("[mail] send failed:", e.message); return false; }
}

async function sendTickets({ order, event, baseUrl, when }) {
  const attachments = [];
  const rows = [];
  for (const t of order.tickets) {
    const url = `${baseUrl}/t/${t.token}`;
    attachments.push({ filename: `${t.code}.png`, cid: t.code, content: await QRCode.toBuffer(url, { width: 360, margin: 1 }) });
    rows.push(`
      <tr><td style="padding:16px;border-top:1px dashed #333">
        <img src="cid:${t.code}" width="150" height="150" style="display:block;background:#fff;border-radius:8px" alt="QR">
      </td><td style="padding:16px;border-top:1px dashed #333;color:#eee;font-family:Arial,sans-serif">
        <div style="font-size:12px;color:#d6fb51;letter-spacing:2px;text-transform:uppercase">${esc(t.tier)}</div>
        <div style="font-size:18px;font-weight:bold;margin:4px 0">${esc(t.holder_name)}</div>
        <div style="font-family:monospace;color:#aaa">${t.code}</div>
        <a href="${url}" style="display:inline-block;margin-top:10px;color:#0b0a10;background:#d6fb51;padding:8px 14px;border-radius:999px;text-decoration:none;font-weight:bold">Open ticket</a>
      </td></tr>`);
  }
  const html = `<div style="background:#0b0a10;padding:24px"><table width="100%" style="max-width:560px;margin:auto;background:#16131f;border-radius:16px" cellspacing="0">
    <tr><td colspan="2" style="padding:24px;font-family:Arial,sans-serif;color:#fff">
      <div style="color:#d6fb51;letter-spacing:3px;font-size:12px">WILD NATION</div>
      <h1 style="margin:8px 0 4px;font-size:28px">${esc(event.title)}</h1>
      <div style="color:#bbb">${esc(when)}<br>${esc([event.venue, event.address, event.city].filter(Boolean).join(", "))}</div>
      <p style="color:#bbb">Order ${order.id}. Show the QR code at the door. Each code works once.</p>
    </td></tr>${rows.join("")}
    <tr><td colspan="2" style="padding:20px;color:#888;font:12px Arial,sans-serif">View your order any time: <a style="color:#d6fb51" href="${baseUrl}/order/${order.id}?k=${order.access_key}">${baseUrl}/order/${order.id}</a></td></tr>
  </table></div>`;
  return send({ to: order.buyer_email, subject: `Your tickets: ${event.title}`, html, attachments,
    text: `Your tickets for ${event.title} (${when}).\n` + order.tickets.map((t) => `${t.tier}: ${baseUrl}/t/${t.token}`).join("\n") });
}

function notifyOwner(subject, text, { to, replyTo } = {}) {
  to = to || process.env.OWNER_EMAIL;
  if (!to) return Promise.resolve(false);
  return send({ to, subject, text, ...(replyTo ? { replyTo } : {}) });
}

// DJ booking requests go to the bookings inbox (falls back to OWNER_EMAIL).
const bookingsInbox = () => process.env.BOOKINGS_EMAIL || "bookings.soja@gmail.com";

module.exports = { enabled, sendTickets, notifyOwner, bookingsInbox, send };
