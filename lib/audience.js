// Mailing list: saving contacts, unsubscribe links, and sending updates.
const crypto = require("crypto");
const { q } = require("./db");
const mail = require("./mail");
const T = require("./ticketing");

const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Save or update a contact. consent=true records an opt-in (and re-subscribes them). */
function upsertContact({ email, name, phone, city, source, consent }) {
  email = clean(email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const ex = q.get(`SELECT * FROM contacts WHERE email=?`, email);
  if (!ex) {
    q.run(`INSERT INTO contacts (email, name, phone, city, source, consent_at) VALUES (?,?,?,?,?,?)`,
      email, clean(name, 120), clean(phone, 40), clean(city, 60), source || "", consent ? new Date().toISOString() : null);
  } else {
    q.run(`UPDATE contacts SET name=COALESCE(NULLIF(?,''),name), phone=COALESCE(NULLIF(?,''),phone), city=COALESCE(NULLIF(?,''),city),
             consent_at=CASE WHEN ? THEN COALESCE(consent_at, ?) ELSE consent_at END,
             unsubscribed_at=CASE WHEN ? THEN NULL ELSE unsubscribed_at END, updated_at=datetime('now') WHERE email=?`,
      clean(name, 120), clean(phone, 40), clean(city, 60), consent ? 1 : 0, new Date().toISOString(), consent ? 1 : 0, email);
  }
  return email;
}

const SECRET = T.tokenFor("UNSUB"); // derived from the ticket secret, stable across restarts
const unsubToken = (email) => crypto.createHmac("sha256", SECRET).update("unsub:" + email.toLowerCase()).digest("base64url").slice(0, 16);
const unsubUrl = (base, email) => `${base}/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubToken(email)}`;
function unsubscribe(email, token) {
  email = clean(email).toLowerCase();
  const good = unsubToken(email);
  if (!token || token.length !== good.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(good))) return false;
  q.run(`UPDATE contacts SET unsubscribed_at=COALESCE(unsubscribed_at, datetime('now')), updated_at=datetime('now') WHERE email=?`, email);
  return true;
}

/** Who gets a campaign. 'event' = ticket holders of that event (event updates), everything else = opted-in list. */
function recipients(aud) {
  if (aud.type === "event") {
    return q.all(`SELECT DISTINCT o.buyer_email AS email, o.buyer_name AS name FROM orders o
                  WHERE o.event_id=? AND o.status IN ('paid','comp')
                  AND o.buyer_email NOT IN (SELECT email FROM contacts WHERE unsubscribed_at IS NOT NULL)`, Number(aud.value));
  }
  const base = `SELECT email, name FROM contacts WHERE consent_at IS NOT NULL AND unsubscribed_at IS NULL`;
  if (aud.type === "city") return q.all(base + ` AND lower(city)=lower(?)`, clean(aud.value, 60));
  return q.all(base);
}

// Simple formatting for update emails: paragraphs, **bold**, [links](url).
function bodyHtml(text) {
  return String(text || "").replace(/\r/g, "").split(/\n{2,}/).filter((b) => b.trim()).map((b) => {
    let h = esc(b.trim())
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" style="color:#d6fb51">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
    if (h.startsWith("## ")) return `<h2 style="font-family:Impact,Arial Black,sans-serif;text-transform:uppercase;font-weight:400;font-size:26px;margin:24px 0 8px;color:#fff">${h.slice(3)}</h2>`;
    return `<p style="margin:0 0 16px;line-height:1.6">${h}</p>`;
  }).join("");
}

function emailHtml({ subject, body, event, eventUrl, when, firstName, unsub, base }) {
  const abs = (u) => (u && u.startsWith("/") ? base + u : u);
  const card = event ? `
    <table width="100%" cellspacing="0" style="margin:8px 0 20px;background:#0f0b18;border:1px solid #2a2238;border-radius:14px;overflow:hidden">
      ${event.flyer ? `<tr><td><a href="${eventUrl}"><img src="${esc(abs(event.flyer))}" width="512" alt="${esc(event.title)}" style="display:block;width:100%;height:auto"></a></td></tr>` : ""}
      <tr><td style="padding:18px 20px">
        <div style="font-family:Impact,Arial Black,sans-serif;text-transform:uppercase;font-size:28px;color:#fff">${esc(event.title)}</div>
        <div style="color:#bbb;margin:6px 0 16px">${esc(when)}<br>${esc([event.venue, event.city].filter(Boolean).join(" · "))}</div>
        <a href="${eventUrl}" style="display:inline-block;background:#d6fb51;color:#0b0a10;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold;text-transform:uppercase;letter-spacing:1px;font-size:14px">Get tickets</a>
      </td></tr></table>` : "";
  const contact = [process.env.BUSINESS_ADDRESS, "wildnationgta@gmail.com", "+1 (365) 366-7490"].filter(Boolean).map(esc).join(" · ");
  return `<div style="background:#08060d;padding:24px 12px"><table width="100%" cellspacing="0" style="max-width:560px;margin:auto;background:#16131f;border-radius:18px;color:#ddd6ec;font-family:Arial,Helvetica,sans-serif;font-size:16px">
    <tr><td style="padding:26px 24px 6px"><img src="${base}/img/icon.png" width="44" height="44" alt="Wild Nation" style="border-radius:8px"></td></tr>
    <tr><td style="padding:10px 24px 8px">
      <h1 style="font-family:Impact,Arial Black,sans-serif;text-transform:uppercase;font-weight:400;font-size:34px;line-height:1.05;margin:0 0 18px;color:#fff">${esc(subject)}</h1>
      ${firstName ? `<p style="margin:0 0 16px">Hey ${esc(firstName)},</p>` : ""}${bodyHtml(body)}${card}
    </td></tr>
    <tr><td style="padding:18px 24px 26px;border-top:1px solid #2a2238;color:#8a839c;font-size:12px;line-height:1.6">
      You're getting this because you signed up for Wild Nation updates or bought a ticket.<br>
      Wild Nation Events · ${contact}<br><a href="${unsub}" style="color:#8a839c">Unsubscribe</a></td></tr></table></div>`;
}

function buildMessage(c, to, base) {
  const unsub = unsubUrl(base, to.email);
  const firstName = clean(to.name).split(/\s+/)[0];
  const html = emailHtml({ ...c, firstName, unsub, base });
  const text = `${c.subject}\n\n${c.body}\n\n${c.event ? `${c.event.title}, ${c.when}\nTickets: ${c.eventUrl}\n\n` : ""}Unsubscribe: ${unsub}`;
  return { to: to.email, subject: c.subject, html, text, headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}

/** Sends in the background, one email at a time, updating the campaign row as it goes. */
async function runCampaign(id, list, content, base) {
  let sent = 0, failed = 0;
  for (const to of list) {
    const ok = await mail.send(buildMessage(content, to, base));
    ok ? sent++ : failed++;
    q.run(`UPDATE campaigns SET sent=?, failed=? WHERE id=?`, sent, failed, id);
    await new Promise((r) => setTimeout(r, Number(process.env.MAIL_DELAY_MS ?? 400))); // be gentle with SMTP limits
  }
  q.run(`UPDATE campaigns SET status=?, finished_at=datetime('now') WHERE id=?`, sent || !list.length ? "sent" : "failed", id);
}

module.exports = { upsertContact, unsubscribe, unsubUrl, recipients, buildMessage, runCampaign };
