// Booking contract terms, invoice numbers and the client emails for DJ bookings.
// Edit TERMS below to change what clients agree to. {placeholders} are filled from booking-config.js.
const crypto = require("crypto");
const { q } = require("./db");
const CFG = require("../public/assets/js/booking-config.js");
const K = CFG.contract;

const money = (n) => "$" + Number(n || 0).toLocaleString("en-CA", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** The agreement, as sections of plain text. `f` is the final booking (price, deposit, date…). */
function terms(f) {
  return [
    ["Booking & deposit",
      `This booking is confirmed once the Client has accepted this agreement and the ${money(f.deposit)} deposit has been received by Interac e-Transfer to ${CFG.bookingEmail}. Until then, the date is not held and may be booked by someone else. The deposit is part of the total price and is non-refundable, because it reserves the date and turns away other bookings.`],
    ["Payment",
      `The total price is ${money(f.grandTotal)}. The remaining balance of ${money(f.balance)} is due ${K.balanceDue}, by Interac e-Transfer to ${CFG.bookingEmail} or in cash. The performance may not start until the balance is paid.`],
    ["Cancellation by the Client",
      `The Client may cancel by email to ${CFG.bookingEmail}. The deposit is not refunded. If the Client cancels less than ${K.cancelFullBalanceDays} days before the event, 50% of the remaining balance is also owed, because the date can no longer reasonably be rebooked.`],
    ["Date or time changes",
      `Requests to change the date must be made in writing at least ${K.rescheduleNoticeDays} days before the event. If Wild Soja is available on the new date, the deposit moves to it once, provided the new date is within ${K.rescheduleWithinMonths} months. Prices for the new date may be updated. If Wild Soja is not available, or the request comes later than ${K.rescheduleNoticeDays} days before, it is treated as a cancellation. Changes to start time, hours or location must be agreed in writing and may change the price.`],
    ["Cancellation by Wild Soja",
      `If Wild Soja has to cancel for any reason within its control, all payments, including the deposit, are refunded in full. Wild Soja will also do its best to recommend a replacement DJ. Wild Soja is not responsible for any other costs.`],
    ["Overtime",
      `If the Client asks for more time on the night and Wild Soja is able to stay, extra time is charged at ${money(f.rate)} per hour (in 30-minute blocks), payable that night.`],
    ["Arrival, setup & venue",
      `Wild Soja arrives about ${K.arriveMinutesBefore} minutes before the start time to set up. The Client will make sure there is safe access to the setup area, a standard power outlet within reach, a table or flat space about 6 ft wide, and, for outdoor events, a covered area protected from rain and direct sun. The Client is responsible for venue permission, noise rules and curfews. Load-in delays caused by the venue do not extend the end time.`],
    ["Equipment & safety",
      `The Client is responsible for damage to Wild Soja's equipment caused by the Client or their guests. Wild Soja may pause or stop the performance, without refund, if conditions become unsafe (for example rain on equipment, fights, or harassment of the DJ), after first trying to resolve it with the Client.`],
    ["Music",
      `Wild Soja will follow the Client's must-play and do-not-play lists where possible and take requests at their professional discretion to keep the event going. Explicit-language edits are used when asked for.`],
    ...(Number(f.hours) >= K.mealHours ? [["Meals & breaks", `For events of ${K.mealHours} hours or more, the Client will provide a meal or a short break for the DJ.`]] : []),
    ["Photos & video",
      `Wild Soja may take photos or short clips of the setup and event for its portfolio and social media. The Client can opt out by letting Wild Soja know in writing.`],
    ["Things outside anyone's control",
      `Neither party is responsible for failing to perform because of events beyond reasonable control, such as severe weather, government orders, serious illness, accidents or power failures. In that case, both parties will first try to move the booking to a new date; if that isn't possible, payments other than the deposit are refunded.`],
    ["Liability",
      `Wild Soja's total liability under this agreement is limited to the amount the Client has paid.`],
    ["Agreement",
      `This agreement, together with the booking details and invoice above, is the full agreement between the Client and ${K.businessName}. By typing their name and accepting, the Client agrees to these terms. This agreement is governed by the laws of Ontario.`],
  ];
}

function nextInvoiceNo() {
  const y = new Date().getFullYear();
  const n = q.get(`SELECT COUNT(*) n FROM bookings WHERE invoice_no LIKE ?`, `INV-${y}-%`).n + 1;
  return `INV-${y}-${String(n).padStart(4, "0")}`;
}
const newToken = () => crypto.randomBytes(18).toString("base64url");

function invoiceRowsHtml(f) {
  const rows = f.lines.filter((l) => l.amount !== 0 || l.dj).map((l) => `<tr><td style="padding:6px 0;color:#ccc">${esc(l.label)}</td><td style="padding:6px 0;text-align:right;color:${l.amount < 0 ? "#d6fb51" : "#fff"}">${l.amount < 0 ? "−" : ""}${money(Math.abs(l.amount))}</td></tr>`).join("");
  return `<table width="100%" cellspacing="0" style="font-size:14px">${rows}
    ${f.hst ? `<tr><td style="padding:6px 0;color:#ccc">HST (${K.hst.rate}%)</td><td style="padding:6px 0;text-align:right">${money(f.hst)}</td></tr>` : ""}
    <tr><td style="padding:10px 0;border-top:1px solid #333;font-weight:bold;color:#fff;font-size:16px">Total</td><td style="padding:10px 0;border-top:1px solid #333;text-align:right;font-weight:bold;color:#d6fb51;font-size:18px">${money(f.grandTotal)}</td></tr>
    <tr><td style="padding:4px 0;color:#ccc">Deposit${f.depositPaidAt ? " (received)" : " due now"}</td><td style="padding:4px 0;text-align:right;color:#fff">${money(f.deposit)}</td></tr>
    <tr><td style="padding:4px 0;color:#ccc">Balance${f.paidAt ? " (paid)" : ` due ${esc(K.balanceDue)}`}</td><td style="padding:4px 0;text-align:right;color:#fff">${money(f.balance)}</td></tr></table>`;
}

function wrapEmail(title, inner, base) {
  return `<div style="background:#08060d;padding:24px 12px"><table width="100%" cellspacing="0" style="max-width:560px;margin:auto;background:#16131f;border-radius:18px;color:#ddd6ec;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55">
    <tr><td style="padding:24px 24px 0"><img src="${base}/img/icon.png" width="44" height="44" alt="Wild Nation" style="border-radius:8px"></td></tr>
    <tr><td style="padding:12px 24px 24px"><h1 style="font-family:Impact,Arial Black,sans-serif;font-weight:400;text-transform:uppercase;font-size:30px;line-height:1.05;margin:0 0 14px;color:#fff">${esc(title)}</h1>${inner}</td></tr>
    <tr><td style="padding:16px 24px 22px;border-top:1px solid #2a2238;color:#8a839c;font-size:12px">${esc(K.businessName)} · ${esc(CFG.bookingEmail)} · ${esc(CFG.brand.phone)}</td></tr></table></div>`;
}
const button = (url, label) => `<p style="margin:20px 0"><a href="${url}" style="display:inline-block;background:#d6fb51;color:#0b0a10;padding:13px 24px;border-radius:999px;text-decoration:none;font-weight:bold;text-transform:uppercase;letter-spacing:1px;font-size:14px">${esc(label)}</a></p>`;
const summary = (b, f) => `<p style="margin:0 0 14px"><b style="color:#fff">${esc(b.event_type)}</b><br>${esc(f.dateText)}${f.timeText ? " · " + esc(f.timeText) : ""}<br>${esc(f.whereText)}</p>`;

function contractEmail(b, f, url, base) {
  const first = String(b.name || "").split(/\s+/)[0];
  const html = wrapEmail("Your booking contract & invoice", `
    <p>Hi ${esc(first)}, thanks for booking Wild Soja! Here's everything for your event.</p>${summary(b, f)}
    ${invoiceRowsHtml(f)}
    <p style="margin-top:18px"><b style="color:#fff">To lock in your date:</b><br>1. Review and accept the booking contract (it takes a minute).<br>2. Send the <b style="color:#fff">${money(f.deposit)} deposit</b> by Interac e-Transfer to <b style="color:#fff">${esc(CFG.bookingEmail)}</b>. Put <b style="color:#fff">${esc(f.invoiceNo)}</b> in the message.</p>
    ${button(url, "Review & sign contract")}
    <p style="font-size:13px;color:#8a839c">Invoice ${esc(f.invoiceNo)}. Questions? Just reply to this email.</p>`, base);
  return { subject: `Your Wild Soja booking contract & invoice (${f.invoiceNo})`, html,
    text: `Hi ${first}, here's your booking contract and invoice ${f.invoiceNo}: ${url}\nTotal ${money(f.grandTotal)}. Deposit ${money(f.deposit)} by Interac e-Transfer to ${CFG.bookingEmail}.` };
}
function signedEmail(b, f, url, base) {
  const html = wrapEmail("Contract signed", `<p>Thanks ${esc(String(b.name).split(/\s+/)[0])}, your contract is signed.</p>${summary(b, f)}
    ${f.depositPaidAt ? "<p>Your deposit is received, so your date is locked in. 🎉</p>" : `<p><b style="color:#fff">Last step:</b> send the ${money(f.deposit)} deposit by Interac e-Transfer to <b style="color:#fff">${esc(CFG.bookingEmail)}</b> with <b style="color:#fff">${esc(f.invoiceNo)}</b> in the message. Your date is held once it arrives.</p>`}
    ${button(url, "View contract & invoice")}`, base);
  return { subject: `Signed: your Wild Soja booking (${f.invoiceNo})`, html, text: `Your contract is signed. View it here: ${url}` };
}
function receiptEmail(b, f, url, base, kind) {
  const title = kind === "deposit" ? "Deposit received: you're booked!" : "Paid in full: thank you!";
  const body = kind === "deposit"
    ? `<p>We received your ${money(f.deposit)} deposit. Your date is locked in. 🎉</p>${summary(b, f)}<p>The balance of <b style="color:#fff">${money(f.balance)}</b> is due ${esc(K.balanceDue)}. We'll be in touch to plan the music.</p>`
    : `<p>We received your final payment. Thanks for booking Wild Soja!</p>${summary(b, f)}`;
  return { subject: `${kind === "deposit" ? "Deposit received" : "Payment received"}: ${f.invoiceNo}`, html: wrapEmail(title, body + invoiceRowsHtml(f) + button(url, "View invoice"), base),
    text: `${title}\n${url}` };
}

module.exports = { terms, nextInvoiceNo, newToken, contractEmail, signedEmail, receiptEmail, money };
