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

  /* ---- Preview mode: the page was opened straight from disk (double-clicked) ----
     There's no server, so site links point at the .html files, read-only data comes
     from assets/js/preview-data.js, and actions (buying, booking, signing up) explain
     that they need the live site. */
  const FILE = location.protocol === "file:";
  function fileHref(p) {
    if (!FILE || typeof p !== "string" || !p.startsWith("/") || p.startsWith("//")) return p;
    const [, path, rest] = p.match(/^([^?#]*)(.*)$/);
    let m;
    if (path === "/") return "index.html" + rest;
    if ((m = path.match(/^\/event\/(.+)$/))) return "event.html?e=" + m[1] + rest.replace(/^\?/, "&");
    if ((m = path.match(/^\/blog\/(.+)$/))) return "post.html?p=" + m[1] + rest.replace(/^\?/, "&");
    if (/^\/(assets|img|vendor)\//.test(path)) return path.slice(1) + rest;
    return path.slice(1) + ".html" + rest;
  }
  const PREVIEW_MSG = "This works on the live site. Opened from your computer, the site is a preview only. To try it fully, start it with npm start (see the README).";
  async function previewApi(url, opts) {
    const D = window.WN_PREVIEW || { events: [], posts: [], config: { currency: "CAD", demo: true } };
    const method = (opts.method || "GET").toUpperCase(), u = new URL(url, "http://x"), p = u.pathname;
    let m;
    if (method === "GET") {
      if (p === "/api/config") return D.config;
      if (p === "/api/events") return D.events;
      if ((m = p.match(/^\/api\/events\/(.+)$/))) { const e = D.events.find((x) => x.slug === decodeURIComponent(m[1])); if (e) return e; throw new Error("Event not found"); }
      if (p === "/api/posts") return D.posts.slice(0, Number(u.searchParams.get("limit")) || undefined).map(({ body, ...x }) => x);
      if ((m = p.match(/^\/api\/posts\/(.+)$/))) {
        const i = D.posts.findIndex((x) => x.slug === decodeURIComponent(m[1]));
        if (i < 0) throw new Error("Post not found");
        const strip = (x) => x && (({ body, ...y }) => y)(x);
        return { ...D.posts[i], newer: strip(D.posts[i - 1]), older: strip(D.posts[i + 1]) };
      }
    }
    throw new Error(PREVIEW_MSG);
  }
  if (FILE) {
    // Rewrite site links (including ones added later, like event cards) as they're clicked.
    document.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest('a[href^="/"]');
      if (!a || a.target === "_blank") return;
      e.preventDefault(); location.href = fileHref(a.getAttribute("href"));
    });
    document.addEventListener("DOMContentLoaded", () => {
      if (document.body.dataset.bare) return;
      const bar = document.createElement("div");
      bar.className = "preview-bar";
      bar.innerHTML = "<b>Preview</b> · opened from your computer. Buying tickets, booking and sign-ups work on the live site.";
      document.body.append(bar);
    });
  }
  const links = [["events", "/events", "Events"], ["tickets", "/events#upcoming", "Tickets"], ["blog", "/blog", "Blog"], ["contact", "/contact", "Contact"], ["wildsoja", "/wildsoja", "Wild Soja", "soja"]];

  const bare = !!document.body.dataset.bare;
  const nav = document.createElement("header");
  nav.className = "nav" + (document.body.dataset.solidNav ? " solid" : "");
  nav.innerHTML = `<div class="wrap">
    <a class="brand" href="/" aria-label="Wild Nation home"><img src="img/logo.webp" alt="Wild Nation" width="58" height="40"></a>
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
          <p style="margin:14px 0 18px;max-width:340px" class="muted">Immersive nights across Hamilton, Toronto and Niagara. Don't think inside the box… wild out on it.</p>
          <div class="socials">${BRAND.socials.map(([n, h, p]) => `<a href="${h}" target="_blank" rel="noopener" aria-label="${n}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg></a>`).join("")}</div></div>
        <div class="footer-links"><b style="margin-bottom:6px">Explore</b><a href="/events">Events</a><a href="/blog">Blog</a><a href="/wildsoja">DJ Wild Soja</a><a href="/book">Book a DJ</a></div>
        <div class="footer-links"><b style="margin-bottom:6px">Contact</b><a href="mailto:${BRAND.email}">${BRAND.email}</a><a href="mailto:bookings.soja@gmail.com">DJ bookings: bookings.soja@gmail.com</a><a href="tel:${BRAND.tel}">${BRAND.phone}</a><a href="/contact">Send a message</a></div>
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
    if (FILE) return previewApi(url, opts);
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
  // Mailing-list sign-up: <div data-signup></div> becomes the full form.
  document.querySelectorAll("[data-signup]").forEach((box, n) => {
    const id = (k) => `su${n}-${k}`;
    box.innerHTML = `<form class="signup" novalidate>
      <div class="signup-grid">
        <div class="field"><label for="${id("name")}">Name</label><input id="${id("name")}" name="name" autocomplete="name" placeholder="Your name"></div>
        <div class="field"><label for="${id("email")}">Email <span class="req">*</span></label><input id="${id("email")}" name="email" type="email" autocomplete="email" required placeholder="you@email.com"></div>
        <div class="field"><label for="${id("phone")}">Phone</label><input id="${id("phone")}" name="phone" type="tel" autocomplete="tel" placeholder="Optional"></div>
        <div class="field"><label for="${id("city")}">Closest city</label><select id="${id("city")}" name="city"><option value="">Choose</option><option>Hamilton</option><option>Toronto</option><option>Niagara</option><option>Other</option></select></div>
      </div>
      <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
      <div class="signup-foot"><button class="btn lg">Notify me</button>
        <p class="hint">By signing up you agree to get event updates from Wild Nation by email. Unsubscribe any time.</p></div>
      <div class="form-msg"></div></form>`;
    const f = box.querySelector("form");
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); const msg = f.querySelector(".form-msg"), btn = f.querySelector("button");
      btn.disabled = true;
      try {
        await api("/api/subscribe", { method: "POST", body: Object.fromEntries(new FormData(f)) });
        f.querySelector(".signup-grid").innerHTML = ""; f.querySelector(".signup-foot").remove();
        msg.className = "form-msg ok"; msg.style.fontSize = "18px"; msg.textContent = "You're on the list. Welcome to the Nation! 🎉";
      } catch (err) { msg.className = "form-msg err"; msg.textContent = err.message; btn.disabled = false; }
    });
  });
  // Equalizers
  document.querySelectorAll(".eq[data-bars]").forEach((eq) => { for (let i = 0; i < +eq.dataset.bars; i++) { const b = document.createElement("i"); b.style.animationDelay = (-Math.random()).toFixed(2) + "s"; b.style.animationDuration = (0.45 + Math.random() * 0.8).toFixed(2) + "s"; eq.append(b); } });

  return { BRAND, api, money, esc, eventCard, loadEvents, reveal, toast, dateParts, setCurrency: (c) => (currency = c), FILE, fileHref };
})();
