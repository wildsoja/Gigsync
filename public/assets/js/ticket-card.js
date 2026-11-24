/* Renders a ticket card (shared by order + single ticket pages). */
window.WN_ticketCard = function (t, ev) {
  const used = t.checked_in_at, voided = t.status !== "valid";
  return `<article class="ticket ${used || voided ? "used" : ""}">
    <div class="t-top"><div class="bg" style="${ev.flyer ? `background-image:url('${WN.esc(ev.flyer)}')` : ""}"></div>
      <img class="logo" src="/img/logo.webp" alt="Wild Nation">
      <span class="t-tier">${WN.esc(t.tier)}</span>
      <h2>${WN.esc(ev.title)}</h2>
      <div class="t-meta">${WN.esc(ev.when)}<br>${WN.esc([ev.venue, ev.city].filter(Boolean).join(" · "))}</div></div>
    <div class="perf"><i></i><i></i></div>
    <div class="t-qr">
      <div class="qr"><img src="/api/qr/${encodeURIComponent(t.token)}.svg" alt="QR code for ticket ${t.code}" width="232" height="232"></div>
      <div class="code">${t.code}</div><div class="holder">${WN.esc(t.holder_name)}</div>
      ${ev.age ? `<div class="muted" style="font-size:13px;margin-top:4px">${WN.esc(ev.age)} · Valid ID required</div>` : ""}
    </div>
    ${voided ? '<div class="stamp"><span>Void</span></div>' : used ? '<div class="stamp"><span>Scanned</span></div>' : ""}
  </article>`;
};
