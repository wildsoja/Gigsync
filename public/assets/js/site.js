/* Shared behaviour: nav, footer, reveal animations, helpers. */
window.WN = (function () {
  const BRAND = {
    email: "wildnationgta@gmail.com", phone: "+1 (365) 366-7490", tel: "+13653667490",
    socials: [
      ["Instagram", "https://www.instagram.com/wld.ntn/", '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>'],
      ["TikTok", "https://www.tiktok.com/@wld.ntn", '<path d="M14 3v11.5a3.5 3.5 0 1 1-3-3.46"/><path d="M14 3c.5 2.5 2.5 4.5 5 5"/>'],
      ["YouTube", "https://www.youtube.com/@Wldntn", '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>'],
      ["Snapchat", "https://www.snapchat.com/add/wldntn", '<path d="M12 3c3 0 5 2.2 5 5v2.5l1.8-.6c.6 0 .9.7.4 1.1l-2 1.2c.6 1.8 2 3 3.8 3.6-.2.8-1.4 1.1-2.6 1.3l-.4 1.4-2-.2c-1 .1-2 1.7-4 1.7s-3-1.6-4-1.7l-2 .2-.4-1.4c-1.2-.2-2.4-.5-2.6-1.3 1.8-.6 3.2-1.8 3.8-3.6l-2-1.2c-.5-.4-.2-1.1.4-1.1l1.8.6V8c0-2.8 2-5 5-5z"/>'],
      ["X", "https://twitter.com/wld_ntn", '<path d="M4 4l16 16M20 4L4 20"/>'],
    ],
  };
  const page = document.body.dataset.page || "";
  const links = [["events", "/events", "Events"], ["tickets", "/events#upcoming", "Tickets"], ["contact", "/contact", "Contact"], ["wildsoja", "/wildsoja", "Wild Soja", "soja"]];

  const bare = !!document.body.dataset.bare;
  const nav = document.createElement("header");
  nav.className = "nav" + (document.body.dataset.solidNav ? " solid" : "");
  nav.innerHTML = `<div class="wrap">
    <a class="brand" href="/" aria-label="Wild Nation home"><img src="/img/logo.webp" alt="Wild Nation" width="58" height="40"></a>
    <button class="nav-toggle" aria-expanded="false" aria-controls="navlinks">Menu</button>
    <nav class="nav-links" id="navlinks">${links.map(([k, h, t, c]) => `<a href="${h}" class="${c || ""}" ${k === page ? 'aria-current="page"' : ""}>${t}</a>`).join("")}
      <a class="btn sm" href="/events#upcoming" style="margin-left:8px">Get tickets</a></nav></div>`;
  if (!bare) document.body.prepend(nav);
  const toggle = nav.querySelector(".nav-toggle");
  toggle.onclick = () => { const o = nav.classList.toggle("open"); toggle.setAttribute("aria-expanded", o); toggle.textContent = o ? "Close" : "Menu"; };
  nav.querySelectorAll(".nav-links a").forEach((a) => a.addEventListener("click", () => { nav.classList.remove("open"); toggle.textContent = "Menu"; }));
  const solid = () => nav.classList.toggle("solid", !!document.body.dataset.solidNav || scrollY > 40);
  addEventListener("scroll", solid, { passive: true }); solid();

  if (!document.body.dataset.noFooter && !bare) {
    const f = document.createElement("footer");
    f.className = "footer";
    f.innerHTML = `<div class="wrap">
      <div class="footer-big" aria-hidden="true">Wild Nation</div>
      <div class="footer-grid">
        <div><div class="eyebrow">Stay wild</div>
          <p style="margin:14px 0 18px;max-width:340px" class="muted">Immersive nights across Toronto, Hamilton and the GTA. Don't think inside the box… wild out on it.</p>
          <div class="socials">${BRAND.socials.map(([n, h, p]) => `<a href="${h}" target="_blank" rel="noopener" aria-label="${n}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg></a>`).join("")}</div></div>
        <div class="footer-links"><b style="margin-bottom:6px">Explore</b><a href="/events">Events</a><a href="/events#recaps">Recaps</a><a href="/wildsoja">DJ Wild Soja</a><a href="/book">Book a DJ</a></div>
        <div class="footer-links"><b style="margin-bottom:6px">Contact</b><a href="mailto:${BRAND.email}">${BRAND.email}</a><a href="tel:${BRAND.tel}">${BRAND.phone}</a><a href="/contact">Send a message</a></div>
      </div>
      <small>© ${new Date().getFullYear()} Wild Nation Events. All rights reserved.</small></div>`;
    document.body.append(f);
  }

  const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.12 }) : null;
  const reveal = (root = document) => root.querySelectorAll(".reveal:not(.in)").forEach((el) => io ? io.observe(el) : el.classList.add("in"));
  reveal();

  let currency = "CAD";
  const money = (cents, cur) => new Intl.NumberFormat("en-CA", { style: "currency", currency: cur || currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  async function api(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) }, body: opts.body && typeof opts.body !== "string" ? JSON.stringify(opts.body) : opts.body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Something went wrong");
    return j;
  }
  function dateParts(iso) {
    const d = new Date(iso);
    return { day: d.getDate(), mon: d.toLocaleDateString("en-CA", { month: "short" }).replace(".", ""), dow: d.toLocaleDateString("en-CA", { weekday: "short" }) };
  }
  function eventCard(e) {
    const p = dateParts(e.starts_at);
    let pill = "";
    if (e.status === "cancelled") pill = '<span class="status-pill cancel">Cancelled</span>';
    else if (e.sold_out) pill = '<span class="status-pill out">Sold out</span>';
    else if (e.tiers && e.tiers.some((t) => t.state === "on_sale" && t.remaining !== null && t.remaining <= 10)) pill = '<span class="status-pill">Selling fast</span>';
    const price = e.from_cents === null || e.from_cents === undefined ? (e.sold_out ? "Sold out" : "Coming soon") : e.from_cents === 0 ? "Free" : `<small>from</small> ${money(e.from_cents)}`;
    return `<a class="ev-card reveal" href="/event/${encodeURIComponent(e.slug)}">
      <div class="poster">${e.flyer ? `<img src="${esc(e.flyer)}" alt="${esc(e.title)} flyer" loading="lazy">` : ""}
        <div class="date-badge"><small>${p.mon}</small><b>${p.day}</b><small>${p.dow}</small></div>${pill}</div>
      <div class="info"><h3>${esc(e.title)}</h3><div class="meta">${esc([e.venue, e.city].filter(Boolean).join(" · "))}</div>
        <div class="row"><span class="price">${price}</span><span class="btn sm">Tickets <span class="arrow">→</span></span></div></div></a>`;
  }
  async function loadEvents(el, { limit } = {}) {
    try {
      const cfg = await api("/api/config"); currency = cfg.currency;
      let evs = await api("/api/events");
      if (limit) evs = evs.slice(0, limit);
      el.innerHTML = evs.length ? evs.map(eventCard).join("") : `<div class="empty-state" style="grid-column:1/-1"><h3>New dates dropping soon</h3><p>Get on the list and you'll hear about the next one first.</p><p style="margin-top:18px"><a class="btn sm" href="#notify">Notify me</a></p></div>`;
      reveal(el);
      return evs;
    } catch (e) { el.innerHTML = `<div class="empty-state" style="grid-column:1/-1">Couldn't load events. Refresh to try again.</div>`; return []; }
  }
  function toast(msg) {
    let t = document.querySelector(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.append(t); }
    t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600);
  }
  // Newsletter forms
  document.querySelectorAll("form[data-subscribe]").forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault(); const msg = f.querySelector(".form-msg");
    try { await api("/api/subscribe", { method: "POST", body: { email: f.email.value } }); f.reset(); msg.className = "form-msg ok"; msg.textContent = "You're on the list. Welcome to the Nation!"; }
    catch (err) { msg.className = "form-msg err"; msg.textContent = err.message; }
  }));
  // Equalizers
  document.querySelectorAll(".eq[data-bars]").forEach((eq) => { for (let i = 0; i < +eq.dataset.bars; i++) { const b = document.createElement("i"); b.style.animationDelay = (-Math.random()).toFixed(2) + "s"; b.style.animationDuration = (0.45 + Math.random() * 0.8).toFixed(2) + "s"; eq.append(b); } });

  return { BRAND, api, money, esc, eventCard, loadEvents, reveal, toast, dateParts, setCurrency: (c) => (currency = c) };
})();
