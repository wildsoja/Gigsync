/* Wild Nation admin: events, tickets, attendees, bookings, messages. */
(function () {
  const app = document.getElementById("app");
  const { api, esc, money } = WN;
  const WN_CONFIG_BOOKING_EMAIL = (window.WN_CONFIG && window.WN_CONFIG.bookingEmail) || "bookings.soja@gmail.com";
  let me = {};

  const fmtDate = (s) => s ? new Date(s.replace(" ", "T") + (s.includes("T") ? "" : "Z")).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const route = () => location.hash.replace(/^#\/?/, "") || "dashboard";

  function shell(active, body, badges = {}) {
    app.innerHTML = `
      <nav class="adm-nav"><div class="wrap">
        <a href="/" title="View site" style="padding:0"><img src="/img/logo.webp" alt="Wild Nation"></a>
        <a href="#dashboard" class="${active === "dashboard" ? "on" : ""}">Events</a>
        <a href="#bookings" class="${active === "bookings" ? "on" : ""}">DJ bookings${badges.bookings ? `<span class="badge">${badges.bookings}</span>` : ""}</a>
        <a href="#audience" class="${active === "audience" ? "on" : ""}">Audience</a>
        <a href="#blog" class="${active === "blog" ? "on" : ""}">Blog</a>
        <a href="#messages" class="${active === "messages" ? "on" : ""}">Messages</a>
        <a href="/admin/scan">Door scanner</a>
        <span class="sp"></span>
        <a href="#" id="logout">Sign out</a>
      </div></nav>
      <main><div class="wrap">${me.demo ? '<div class="banner" style="margin-bottom:20px"><b>Test mode:</b> Stripe isn\'t connected, so checkout issues tickets without taking payment. Add STRIPE_SECRET_KEY to go live.</div>' : ""}
      ${!me.email ? '<div class="banner" style="margin-bottom:20px;color:var(--muted);border-color:var(--line-2);background:var(--surface)">Email is off: buyers see their tickets on screen but don\'t get them by email. Add SMTP settings to turn it on.</div>' : ""}
      ${body}</div></main>`;
    document.getElementById("logout").onclick = async (e) => { e.preventDefault(); await api("/api/admin/logout", { method: "POST" }); render(); };
  }

  function login() {
    app.innerHTML = `<div class="wrap"><form class="login card" id="lf">
      <img src="/img/logo.webp" alt="Wild Nation" style="height:56px;margin:0 auto 16px">
      <h1 class="t" style="font-size:36px;margin-bottom:18px">Admin</h1>
      ${me.configured ? "" : '<div class="banner" style="margin-bottom:14px;text-align:left">Set the <b>ADMIN_PASSWORD</b> environment variable on your server to enable sign-in.</div>'}
      <div class="field"><label for="pw" class="sr-only">Password</label><input id="pw" type="password" placeholder="Password" autocomplete="current-password" autofocus></div>
      <button class="btn block">Sign in</button><div class="form-msg err" id="le"></div></form></div>`;
    document.getElementById("lf").onsubmit = async (e) => {
      e.preventDefault();
      try { await api("/api/admin/login", { method: "POST", body: { password: document.getElementById("pw").value } }); render(); }
      catch (err) { document.getElementById("le").textContent = err.message; }
    };
  }

  // ---------- Dashboard ----------
  async function dashboard() {
    const s = await api("/api/admin/summary");
    const upcomingSold = s.events.reduce((n, e) => n + e.stats.sold, 0);
    const revenue = s.events.reduce((n, e) => n + e.stats.revenue_cents, 0);
    shell("dashboard", `
      <div class="top"><h1 class="t">Events</h1><a class="btn" href="#event/new">+ New event</a></div>
      <div class="stats">
        <div class="stat-card"><small>Tickets issued</small><b>${upcomingSold}</b></div>
        <div class="stat-card"><small>Revenue</small><b>${money(revenue)}</b></div>
        <div class="stat-card"><small>New DJ requests</small><b>${s.newBookings}</b></div>
        <a class="stat-card" href="#audience" style="text-decoration:none"><small>Mailing list</small><b>${s.subscribers}</b><span class="lime" style="font-size:13px">${s.contacts} contacts saved →</span></a>
      </div>
      ${s.events.length ? s.events.map((e) => {
        const pct = e.capacity ? Math.min(100, Math.round((e.stats.sold / e.capacity) * 100)) : 0;
        return `<a class="ev-row" href="#event/${e.id}">
          <div class="th" style="${e.flyer ? `background-image:url('${esc(e.flyer)}')` : ""}"></div>
          <div><h3>${esc(e.title)} <span class="pill ${e.status}">${e.status}</span></h3>
            <div class="m">${esc(e.when)} · ${esc([e.venue, e.city].filter(Boolean).join(", "))}</div>
            <div class="m" style="margin-top:6px">${e.stats.sold} / ${e.capacity} sold · ${e.stats.checked_in} checked in · ${money(e.stats.revenue_cents)}${e.stats.test_cents ? ` <span class="pill">+ ${money(e.stats.test_cents)} test</span>` : ""}</div>
            <div class="bar"><i style="width:${pct}%"></i></div></div>
          <span class="lime">→</span></a>`;
      }).join("") : '<div class="empty-state"><h3>No events yet</h3><p>Create your first event to start selling tickets.</p></div>'}`, { bookings: s.newBookings });
  }

  // ---------- Event editor ----------
  async function eventPage(id) {
    const isNew = id === "new";
    const e = isNew ? { status: "draft", age: "19+", tiers: [{ name: "General Admission", price_cents: 2000, quantity: 100, max_per_order: 10 }] } : await api("/api/admin/events/" + id);
    const summary = isNew ? null : e.stats;
    shell("dashboard", `
      <div class="top"><div><a href="#dashboard" class="eyebrow" style="text-decoration:none">← Events</a><h1 class="t" style="margin-top:8px">${isNew ? "New event" : esc(e.title)}</h1></div>
        ${isNew ? "" : `<div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn ghost sm" href="/event/${esc(e.slug)}" target="_blank">View page ↗</a><a class="btn sm" href="/admin/scan?event=${e.id}">Scan tickets</a></div>`}</div>
      ${summary ? `<div class="stats">
        <div class="stat-card"><small>Sold</small><b>${summary.sold}</b></div>
        <div class="stat-card"><small>Checked in</small><b>${summary.checked_in}</b></div>
        <div class="stat-card"><small>Revenue</small><b>${money(summary.revenue_cents)}</b></div>
        <div class="stat-card"><small>Orders</small><b>${summary.orders}</b></div></div>` : ""}
      <div class="tabs" ${isNew ? 'style="display:none"' : ""}><button data-tab="details" class="on">Details & tickets</button><button data-tab="attendees">Attendees</button><button data-tab="comp">Send comp tickets</button></div>
      <div id="tab"></div>`);

    const tabs = {
      details: () => editor(e, isNew),
      attendees: () => attendeesTab(e),
      comp: () => compTab(e),
    };
    app.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => {
      app.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === b));
      tabs[b.dataset.tab]();
    });
    tabs.details();
  }

  function tierRow(t = {}) {
    return `<div class="tier-ed" data-id="${t.id || ""}">
      <div class="field"><label>Ticket name</label><input name="name" value="${esc(t.name || "")}" placeholder="e.g. Early Bird"></div>
      <div class="field"><label>Price (${esc("$")})</label><input name="price" type="number" min="0" step="0.01" value="${t.price_cents != null ? (t.price_cents / 100).toFixed(2) : ""}"></div>
      <div class="field"><label>Quantity</label><input name="quantity" type="number" min="0" value="${t.quantity ?? 100}"></div>
      <div class="field"><label>Max / order</label><input name="max_per_order" type="number" min="1" max="50" value="${t.max_per_order ?? 10}"></div>
      <button type="button" class="icon-btn" data-remove title="Remove ticket type" aria-label="Remove ticket type">✕</button>
      <div class="full">
        <div class="field"><label>Description</label><input name="description" value="${esc(t.description || "")}" placeholder="Optional"></div>
        <div class="field"><label>Sales start</label><input name="sales_start" type="datetime-local" value="${esc(t.sales_start || "")}"></div>
        <div class="field"><label>Sales end</label><input name="sales_end" type="datetime-local" value="${esc(t.sales_end || "")}"></div>
      </div>
      ${t.id ? `<div class="full hint" style="display:block">${t.quantity - t.remaining} sold/held · ${t.remaining} left${t.state && t.state !== "on_sale" ? ` · <b>${t.state.replace("_", " ")}</b>` : ""}</div>` : ""}
    </div>`;
  }

  function editor(e, isNew) {
    const tab = document.getElementById("tab");
    tab.innerHTML = `<form id="ef" novalidate><div class="ed-grid">
      <div>
        <label class="flyer-drop ${e.flyer ? "has" : ""}" id="drop" style="${e.flyer ? `background-image:url('${esc(e.flyer)}')` : ""}">
          <span>${e.flyer ? "Change flyer" : "Upload flyer<br><small>JPG/PNG, portrait 4:5 works best</small>"}</span>
          <input type="file" accept="image/*" id="file" hidden></label>
        <input type="hidden" name="flyer" value="${esc(e.flyer || "")}">
        <div class="field" style="margin-top:16px"><label>Status</label>
          <select name="status"><option value="draft">Draft (hidden)</option><option value="published">Published (on sale)</option><option value="cancelled">Cancelled</option></select></div>
      </div>
      <div>
        <div class="field"><label>Event title <span class="req">*</span></label><input name="title" required value="${esc(e.title || "")}" placeholder="e.g. Entanglement 2027"></div>
        <div class="field"><label>Tagline</label><input name="tagline" value="${esc(e.tagline || "")}" placeholder="e.g. A masked night at Toop Lounge"></div>
        <div class="row2">
          <div class="field"><label>Starts <span class="req">*</span></label><input name="starts_at" type="datetime-local" required value="${esc(e.starts_at || "")}"></div>
          <div class="field"><label>Ends</label><input name="ends_at" type="datetime-local" value="${esc(e.ends_at || "")}"></div>
        </div>
        <div class="row2">
          <div class="field"><label>Venue</label><input name="venue" value="${esc(e.venue || "")}"></div>
          <div class="field"><label>City</label><input name="city" value="${esc(e.city || "")}" placeholder="Toronto, ON"></div>
        </div>
        <div class="field"><label>Address</label><input name="address" value="${esc(e.address || "")}"></div>
        <div class="row2">
          <div class="field"><label>Age</label><input name="age" value="${esc(e.age || "")}" placeholder="19+"></div>
          <div class="field"><label>Dress code</label><input name="dress_code" value="${esc(e.dress_code || "")}"></div>
        </div>
        <div class="field"><label>Description</label><textarea name="description" style="min-height:140px">${esc(e.description || "")}</textarea></div>
        <div class="field"><label>Page URL</label><input name="slug" value="${esc(e.slug || "")}" placeholder="auto from title"><span class="hint">yoursite.com/event/<b id="slugPrev">${esc(e.slug || "…")}</b></span></div>

        <h2 class="t" style="font-size:30px;margin:30px 0 12px">Ticket types</h2>
        <div id="tiers">${(e.tiers || []).filter((t) => t.active !== 0).map(tierRow).join("")}</div>
        <button type="button" class="btn ghost sm" id="addTier">+ Add ticket type</button>
      </div></div>
      <div class="sticky-save"><button class="btn">${isNew ? "Create event" : "Save changes"}</button>
        ${isNew ? "" : '<button type="button" class="btn ghost sm" id="del" style="margin-left:auto">Delete event</button>'}
        <span class="form-msg" id="em" style="margin:0"></span></div></form>`;
    const f = document.getElementById("ef");
    f.status.value = e.status || "draft";
    f.slug.oninput = () => document.getElementById("slugPrev").textContent = f.slug.value || "…";
    document.getElementById("addTier").onclick = () => document.getElementById("tiers").insertAdjacentHTML("beforeend", tierRow({ name: "", price_cents: null }));
    document.getElementById("tiers").onclick = (ev) => { const b = ev.target.closest("[data-remove]"); if (b) b.closest(".tier-ed").remove(); };
    document.getElementById("file").onchange = async (ev) => {
      const file = ev.target.files[0]; if (!file) return;
      const msg = document.getElementById("em"); msg.className = "form-msg"; msg.textContent = "Uploading…";
      try {
        const dataUrl = await shrink(file);
        const r = await api("/api/admin/upload", { method: "POST", body: { dataUrl } });
        f.flyer.value = r.url; const d = document.getElementById("drop");
        d.style.backgroundImage = `url('${r.url}')`; d.classList.add("has"); d.querySelector("span").textContent = "Change flyer";
        msg.textContent = "Flyer uploaded. Save to keep it.";
      } catch (err) { msg.className = "form-msg err"; msg.textContent = err.message; }
    };
    const del = document.getElementById("del");
    if (del) del.onclick = async () => {
      if (!confirm("Delete this event permanently?")) return;
      try { await api("/api/admin/events/" + e.id, { method: "DELETE" }); location.hash = "dashboard"; }
      catch (err) { const m = document.getElementById("em"); m.className = "form-msg err"; m.textContent = err.message; }
    };
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = document.getElementById("em");
      const body = Object.fromEntries(new FormData(f));
      body.tiers = [...document.querySelectorAll(".tier-ed")].map((row) => {
        const t = { id: row.dataset.id ? +row.dataset.id : undefined };
        row.querySelectorAll("input").forEach((i) => t[i.name] = i.value);
        return t;
      });
      if (body.status === "published" && !body.tiers.length && !confirm("Publish with no ticket types? People won't be able to buy tickets.")) return;
      try {
        const r = await api(isNew ? "/api/admin/events" : "/api/admin/events/" + e.id, { method: isNew ? "POST" : "PUT", body });
        WN.toast("Saved");
        if (isNew) location.hash = "event/" + r.id; else eventPage(e.id);
      } catch (err) { msg.className = "form-msg err"; msg.textContent = err.message; }
    };
  }

  // Resize big flyers in the browser before upload.
  function shrink(file, max = 1400) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        res(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => rej(new Error("Couldn't read that image"));
      img.src = url;
    });
  }

  async function attendeesTab(e) {
    const tab = document.getElementById("tab");
    tab.innerHTML = '<p class="muted">Loading…</p>';
    const rows = await api(`/api/admin/events/${e.id}/attendees`);
    tab.innerHTML = `
      <div class="top" style="margin-bottom:14px"><input id="q" placeholder="Search name, email or code" style="max-width:340px">
        <a class="btn ghost sm" href="/api/admin/events/${e.id}/attendees.csv">Export CSV</a></div>
      <div class="tbl"><table><thead><tr><th>Guest</th><th>Ticket</th><th>Code</th><th>Order</th><th>Status</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>
      ${rows.length ? "" : '<p class="muted" style="text-align:center;margin-top:20px">No tickets yet.</p>'}`;
    const draw = (list) => document.getElementById("tb").innerHTML = list.map((r) => `<tr>
      <td><b>${esc(r.holder_name)}</b><br><span class="muted">${esc(r.buyer_email)}</span></td>
      <td>${esc(r.tier)}${r.order_status === "comp" ? ' <span class="pill quoted">comp</span>' : ""}${r.demo ? ' <span class="pill">test</span>' : ""}</td>
      <td class="mono">${r.code}</td>
      <td class="mono" style="font-size:12px">${r.order_id}<br><span class="muted">${fmtDate(r.created_at)}</span></td>
      <td>${r.status !== "valid" ? '<span class="pill void">void</span>' : r.checked_in_at ? `<span class="pill ok">in · ${fmtDate(r.checked_in_at)}</span>` : '<span class="pill">not scanned</span>'}</td>
      <td style="white-space:nowrap">${r.status === "valid" ? (r.checked_in_at ? `<button class="link" data-undo="${r.code}">Undo check-in</button>` : `<button class="link" data-in="${r.code}">Check in</button>`) : ""}
        · <button class="link" data-resend="${r.order_id}">Resend</button>
        ${r.status === "valid" ? ` · <button class="link" data-cancel="${r.order_id}" style="color:var(--danger)">Cancel order</button>` : ""}</td></tr>`).join("");
    draw(rows);
    document.getElementById("q").oninput = (ev) => {
      const s = ev.target.value.toLowerCase();
      draw(rows.filter((r) => [r.holder_name, r.buyer_email, r.code, r.order_id].some((v) => String(v).toLowerCase().includes(s))));
    };
    document.getElementById("tb").onclick = async (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      try {
        if (b.dataset.in) { const r = await api("/api/admin/checkin", { method: "POST", body: { token: b.dataset.in } }); WN.toast(r.result === "ok" ? "Checked in" : r.result); }
        if (b.dataset.undo) { await api(`/api/admin/tickets/${b.dataset.undo}/undo-checkin`, { method: "POST" }); WN.toast("Check-in undone"); }
        if (b.dataset.resend) {
          const r = await api(`/api/admin/orders/${b.dataset.resend}/resend`, { method: "POST" }).catch((x) => ({ error: x.message }));
          if (r.ok) WN.toast("Tickets emailed");
          else if (r.orderUrl) { await navigator.clipboard?.writeText(r.orderUrl).catch(() => {}); prompt("Email isn't set up. Send the guest this link (copied):", r.orderUrl); }
          else WN.toast(r.error || "Couldn't resend");
          return;
        }
        if (b.dataset.cancel) {
          if (!confirm("Cancel this whole order? Its tickets will stop working at the door. Refund the payment in Stripe separately.")) return;
          await api(`/api/admin/orders/${b.dataset.cancel}/cancel`, { method: "POST" }); WN.toast("Order cancelled");
        }
        attendeesTab(e);
      } catch (err) { WN.toast(err.message); }
    };
  }

  function compTab(e) {
    const tab = document.getElementById("tab");
    const tiers = (e.tiers || []).filter((t) => t.active !== 0);
    tab.innerHTML = `<form class="card" id="cf" style="max-width:560px">
      <p class="muted" style="margin-top:0">Issue free tickets for guest list, performers, promoters or giveaways. They work at the door like any other ticket.</p>
      <div class="row2"><div class="field"><label>Guest name</label><input name="name" required></div><div class="field"><label>Guest email</label><input name="email" type="email" required></div></div>
      <div class="row2"><div class="field"><label>Ticket type</label><select name="typeId">${tiers.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></div>
        <div class="field"><label>How many</label><input name="qty" type="number" min="1" max="50" value="1"></div></div>
      <button class="btn">Send comp tickets</button><div class="form-msg" id="cm"></div></form>`;
    document.getElementById("cf").onsubmit = async (ev) => {
      ev.preventDefault();
      const f = ev.target, m = document.getElementById("cm");
      try {
        const r = await api("/api/admin/comp", { method: "POST", body: { eventId: e.id, typeId: f.typeId.value, qty: f.qty.value, name: f.name.value, email: f.email.value } });
        m.className = "form-msg ok";
        m.innerHTML = (r.emailed ? "Sent! Tickets emailed to the guest. " : "Created! Email is off, so send the guest this link: ") + `<a class="lime" href="${esc(r.orderUrl)}" target="_blank">open tickets</a>`;
        f.name.value = ""; f.email.value = "";
      } catch (err) { m.className = "form-msg err"; m.textContent = err.message; }
    };
  }

  // ---------- Bookings ----------
  async function bookings() {
    const list = await api("/api/admin/bookings");
    const CFG = window.WN_CONFIG || {};
    const fields = [["Date", "date"], ["Start", "startTime"], ["Hours", "hours"], ["Guests", "guestRange"], ["City", "city"], ["Location", "location"], ["Venue", "venue"], ["Venue sound?", "venueSound"],
      ["Mics", "mics"], ["Extras", "extras"], ["Referred by", "referral"], ["Notes", "notes"], ["Prefers", "contactPref"],
      ["Add-ons", "addOns"], ["Genres", "genres"], ["Must-play", "mustPlay"], ["Do-not-play", "doNotPlay"], ["Budget", "budget"]];
    const statusLabel = { new: "new", quoted: "quoted", contract_sent: "contract sent", signed: "signed", confirmed: "deposit paid", paid: "paid in full", declined: "declined", cancelled: "cancelled" };
    const show = (v) => Array.isArray(v) ? v.join(", ") : v;
    const $$ = (n) => "$" + Number(n || 0).toLocaleString("en-CA", { maximumFractionDigits: 2 });
    const quoteText = (b) => {
      const e = b.data.estimate, first = (b.name || "").split(/\s+/)[0];
      if (!e || !e.lines || e.customType) return "";
      return `Hi ${first}, thanks for reaching out about your ${b.event_type.toLowerCase()} on ${b.event_date}! ` +
        `For ${e.hours} hours of DJ${e.travel && e.travel.charge ? ", including travel" : ""}, it's $${e.total}${e.custom ? " plus travel" : ""}` +
        `${e.discount ? " (with your referral discount)" : ""}. If that works, I'll send over the booking contract. To lock in the date, ` +
        `there's a $${CFG.deposit || 100} deposit by Interac e-Transfer to ${WN_CONFIG_BOOKING_EMAIL}. - Wild Soja`;
    };
    const lineRows = (lines) => lines.filter((l) => l.amount !== 0 || l.dj).map((l) => `<div class="inv-row"><span>${esc(l.label)}</span><b class="${l.amount < 0 ? "lime" : ""}">${l.amount < 0 ? "−" : ""}${$$(Math.abs(l.amount))}</b></div>`).join("");

    function contractPanel(b) {
      const e = b.data.estimate || {}, f = b.final, type = (CFG.eventTypes || {})[b.data.type] || {};
      if (f) {
        const step = (done, label, extra = "") => `<div class="step ${done ? "done" : ""}"><i>${done ? "✓" : ""}</i><span>${label}${extra}</span></div>`;
        return `<div class="contract-box">
          <div class="top" style="margin:0 0 10px"><b>Contract & invoice ${esc(f.invoiceNo)}</b><span><b class="lime" style="font-size:20px">${$$(f.grandTotal)}</b></span></div>
          ${lineRows(f.lines)}
          <div class="inv-row"><span>Deposit</span><b>${$$(f.deposit)}</b></div><div class="inv-row"><span>Balance</span><b>${$$(f.balance)}</b></div>
          <div class="steps">
            ${step(true, "Contract sent", ` <span class="muted">${fmtDate(b.contract_sent_at)}</span>`)}
            ${step(!!b.signed_at, "Signed", b.signed_at ? ` <span class="muted">by ${esc(b.signed_name)}, ${fmtDate(b.signed_at)}</span>` : ' <span class="muted">waiting for the client</span>')}
            ${step(!!b.deposit_paid_at, "Deposit received", b.deposit_paid_at ? ` <span class="muted">${fmtDate(b.deposit_paid_at)}</span>` : "")}
            ${step(!!b.paid_at, "Paid in full", b.paid_at ? ` <span class="muted">${fmtDate(b.paid_at)}</span>` : "")}
          </div>
          <p style="margin:12px 0 0;display:flex;gap:8px;flex-wrap:wrap">
            ${!b.deposit_paid_at ? `<button type="button" class="btn sm" data-act="deposit-received" data-id="${b.id}">Mark deposit received</button>` : ""}
            ${!b.paid_at ? `<button type="button" class="btn sm ${b.deposit_paid_at ? "" : "ghost"}" data-act="paid-in-full" data-id="${b.id}">Mark paid in full</button>` : ""}
            <a class="btn sm ghost" href="${esc(b.link)}" target="_blank">Open contract ↗</a>
            <button type="button" class="btn sm ghost" data-copylink="${esc(b.link)}">Copy link</button>
            ${!b.signed_at ? `<button type="button" class="btn sm ghost" data-edit="${b.id}">Edit & resend</button>` : ""}</p>
          ${!b.signed_at ? `<div data-editor="${b.id}" hidden>${contractForm(b, f)}</div>` : ""}
        </div>`;
      }
      return `<div class="contract-box"><b>Contract & invoice</b>
        <p class="muted" style="margin:4px 0 12px;font-size:14px">Agreed on a price? Set the final details and send the booking contract and invoice to ${esc(b.email)}.</p>
        ${contractForm(b, null)}</div>`;
    }

    function contractForm(b, f) {
      const e = b.data.estimate || {}, type = (CFG.eventTypes || {})[b.data.type] || {};
      const rate = f ? f.rate : e.rate || type.rate || CFG.hourlyRate || 100;
      const disc = f ? f.discountPct : e.discountPct || 0;
      const travel = f ? (f.lines.find((l) => /^Travel/.test(l.label)) || {}).amount || 0 : (e.travel && e.travel.charge) || 0;
      const adj = f ? f.lines.filter((l) => !l.dj && !l.discount && !l.minimum && !/^Travel|^Sound|microphone|^Lighting|^MC|planning/i.test(l.label)) : [];
      return `<form class="cform" data-id="${b.id}">
        <div class="cgrid">
          <label>Hours<input name="hours" type="number" min="1" max="12" step="0.5" value="${esc(f ? f.hours : b.data.hours || 4)}"></label>
          <label>Rate / hr<input name="rate" type="number" min="${CFG.floorRate || 0}" step="5" value="${esc(rate)}"></label>
          <label>Discount<select name="discountPct">${(CFG.discountOptions || [0, 10, 15, 20, 25]).map((p) => `<option value="${p}" ${Number(disc) === p ? "selected" : ""}>${p ? p + "% off" : "None"}</option>`).join("")}</select></label>
          <label>Travel $<input name="travelCharge" type="number" min="0" step="5" value="${esc(travel)}"></label>
          <label>Deposit $<input name="deposit" type="number" min="0" step="10" value="${esc(f ? f.deposit : CFG.deposit || 100)}"></label>
          <label>Start time<input name="startTime" type="time" value="${esc(f ? f.startTime : b.data.startTime || "")}"></label>
          <label>End time<input name="endTime" type="time" value="${esc(f ? f.endTime : "")}"></label>
          <label>Venue<input name="venue" value="${esc(b.data.venue || "")}"></label>
        </div>
        <div class="adj">
          ${[0, 1].map((i) => `<div class="cgrid2"><input name="adjLabel${i}" placeholder="Extra line (e.g. Ceremony audio)" value="${esc((adj[i] || {}).label || "")}"><input name="adjAmount${i}" type="number" step="5" placeholder="$" value="${esc((adj[i] || {}).amount || "")}"></div>`).join("")}
        </div>
        <label style="display:block;margin-top:8px">Note on the contract (optional)<input name="notes" value="${esc(f ? f.notes || "" : "")}" placeholder="e.g. Includes ceremony + reception, client provides table"></label>
        <div class="cpreview muted">Working out totals…</div>
        <button class="btn">${f ? "Resend updated contract" : "Send contract & invoice"}</button> <span class="form-msg" style="margin:0"></span>
        <p class="hint" style="margin:8px 0 0">Discounts apply to DJ time only and never go below $${CFG.floorRate || 75}/hr or your area minimum.</p>
      </form>`;
    }
    const formBody = (form) => {
      const d = Object.fromEntries(new FormData(form));
      d.adjustments = [0, 1].map((i) => ({ label: d["adjLabel" + i], amount: d["adjAmount" + i] })).filter((a) => a.label && Number(a.amount));
      return d;
    };

    shell("bookings", `
      <div class="top"><h1 class="t">DJ bookings</h1><span class="muted">${list.length} request${list.length === 1 ? "" : "s"}</span></div>
      ${list.length ? list.map((b) => {
        const e = b.data.estimate || {}, msg = quoteText(b), phone = String(b.phone || "").replace(/[^\d+]/g, "");
        const quoteHtml = e.lines ? `<div><span>Suggested quote</span><span>${e.customType ? "<b>Custom quote</b>: set a rate below and send the contract" : `${e.lines.map((l) => `${esc(l.label)}: <b>${l.amount < 0 ? "−" : ""}$${Math.abs(l.amount)}</b>`).join("<br>")}
            <br><b class="lime" style="font-size:18px">Total $${e.total}${e.custom ? " + travel (you set it)" : ""}</b>${e.minApplied ? ` <span class="pill new">minimum applied</span>` : ""}
            ${e.referred && !e.discount ? `<br><span class="muted">Referred, but no discount applies (club rate or already at the minimum)</span>` : ""}
            ${e.travel && e.travel.charge ? `<br><span class="muted" style="font-size:12px">Travel: ${e.travel.roundTripKm} km × $${e.travel.perKm}/km = $${e.travel.raw}, rounded up${e.travel.city.extra ? `, + $${e.travel.city.extra} parking/traffic` : ""}</span>` : ""}`}</span></div>` : "";
        return `<details class="bk" ${b.id === bookings.open ? "open" : ""}><summary>
          <div><b>${esc(b.name)}</b> · ${esc(b.event_type)} · ${esc(b.event_date)}${b.data.city ? ` · ${esc(b.data.city.split(" (")[0])}` : ""}<br><span class="muted" style="font-size:13px">${esc(b.ref)} · received ${fmtDate(b.created_at)}${b.data.referral ? " · referred" : ""}${b.invoice_no ? " · " + esc(b.invoice_no) : ""}</span></div>
          <b class="lime">${b.data.estimate && b.data.estimate.customType && !b.final ? "custom" : money(b.estimate_cents)}</b>
          <select class="inline" data-id="${b.id}">${Object.keys(statusLabel).map((s) => `<option value="${s}" ${s === b.status ? "selected" : ""}>${statusLabel[s]}</option>`).join("")}</select></summary>
        <div class="body">
          <div><span>Contact</span><span><a class="lime" href="tel:${esc(phone)}">${esc(b.phone)}</a> · <a class="lime" href="mailto:${esc(b.email)}">${esc(b.email)}</a></span></div>
          ${fields.filter(([, k]) => b.data[k] && show(b.data[k]).length).map(([l, k]) => `<div><span>${l}</span><span>${esc(show(b.data[k]))}</span></div>`).join("")}
          ${quoteHtml}
          ${msg && !b.final ? `<div><span>Quote message</span><span><textarea class="qmsg" rows="3" style="font-size:14px">${esc(msg)}</textarea>
            <span style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            ${phone ? `<a class="btn sm ghost" data-sms="${esc(phone)}" href="sms:${esc(phone)}">Text quote</a>` : ""}
            <a class="btn sm ghost" data-mail="${esc(b.email)}" data-subj="${esc("Your Wild Soja quote (" + b.ref + ")")}" href="mailto:${esc(b.email)}">Email quote</a>
            <button type="button" class="btn sm ghost" data-copy>Copy message</button></span></span></div>` : ""}
          ${contractPanel(b)}
        </div></details>`;
      }).join("") : '<div class="empty-state"><h3>No requests yet</h3><p>Share <b>yoursite.com/book</b> with clients. Their requests show up here.</p></div>'}`,
      { bookings: list.filter((b) => b.status === "new").length });

    app.querySelectorAll("select[data-id]").forEach((sel) => {
      sel.onclick = (ev) => ev.stopPropagation();
      sel.onchange = async () => { await api("/api/admin/bookings/" + sel.dataset.id, { method: "PUT", body: { status: sel.value } }); WN.toast("Updated"); };
    });
    app.querySelectorAll("details.bk").forEach((d) => {
      const box = d.querySelector(".qmsg");
      if (box) {
        const sms = d.querySelector("[data-sms]"), mail = d.querySelector("[data-mail]");
        const sync = () => {
          if (sms) sms.href = `sms:${sms.dataset.sms}?&body=${encodeURIComponent(box.value)}`;
          mail.href = `mailto:${mail.dataset.mail}?subject=${encodeURIComponent(mail.dataset.subj)}&body=${encodeURIComponent(box.value)}`;
        };
        box.oninput = sync; sync();
        d.querySelector("[data-copy]").onclick = async () => { try { await navigator.clipboard.writeText(box.value); WN.toast("Copied"); } catch (e) { box.select(); } };
      }
    });
    // Contract forms: live totals + send
    app.querySelectorAll("form.cform").forEach((form) => {
      const id = form.dataset.id, out = form.querySelector(".cpreview"), msg = form.querySelector(".form-msg");
      let t;
      const preview = () => { clearTimeout(t); t = setTimeout(async () => {
        try {
          const f = await api(`/api/admin/bookings/${id}/preview`, { method: "POST", body: formBody(form) });
          out.innerHTML = `${lineRows(f.lines)}${f.hst ? `<div class="inv-row"><span>HST</span><b>${$$(f.hst)}</b></div>` : ""}
            <div class="inv-row total"><span>Total</span><b class="lime">${$$(f.grandTotal)}</b></div>
            <div class="inv-row"><span>Deposit now · balance on the day</span><b>${$$(f.deposit)} · ${$$(f.balance)}</b></div>`;
        } catch (err) { out.textContent = err.message; }
      }, 250); };
      form.addEventListener("input", preview); preview();
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const b = list.find((x) => String(x.id) === id);
        if (!confirm(`Send the booking contract and invoice to ${b.email}?`)) return;
        const btn = form.querySelector("button.btn"); btn.disabled = true;
        try {
          const r = await api(`/api/admin/bookings/${id}/send-contract`, { method: "POST", body: formBody(form) });
          if (!r.emailed) prompt("Contract created, but email isn't set up, so it wasn't emailed. Send the client this link:", r.link);
          else WN.toast("Contract & invoice sent");
          bookings.open = Number(id); await bookings();
        } catch (err) { msg.className = "form-msg err"; msg.textContent = err.message; btn.disabled = false; }
      };
    });
    app.querySelectorAll("[data-act]").forEach((btn) => btn.onclick = async () => {
      const label = btn.dataset.act === "deposit-received" ? "Mark the deposit as received and email the client a receipt?" : "Mark as paid in full and email the client a receipt?";
      if (!confirm(label)) return;
      const r = await api(`/api/admin/bookings/${btn.dataset.id}/${btn.dataset.act}`, { method: "POST", body: {} });
      WN.toast(r.emailed ? "Saved · receipt emailed" : "Saved");
      bookings.open = Number(btn.dataset.id); await bookings();
    });
    app.querySelectorAll("[data-copylink]").forEach((b) => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copylink); WN.toast("Link copied"); } catch (e) { prompt("Copy this link:", b.dataset.copylink); } });
    app.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => { const ed = app.querySelector(`[data-editor="${b.dataset.edit}"]`); ed.hidden = !ed.hidden; });
  }

  // ---------- Audience ----------
  async function audiencePage() {
    const [contacts, campaigns] = await Promise.all([api("/api/admin/contacts"), api("/api/admin/campaigns")]);
    const onList = contacts.filter((c) => c.on_list);
    const srcLabel = { signup: "Sign-up form", ticket: "Ticket buyer", booking: "DJ booking", contact: "Contact form", comp: "Comp guest", import: "Import" };
    const monthYear = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-CA", { month: "short", year: "numeric" }).replace(".", "");
    const status = (c) => c.unsubscribed_at ? '<span class="pill void">opted out</span>'
      : c.consent_at ? '<span class="pill ok">signed up</span>'
      : c.on_list ? `<span class="pill quoted" title="Customer: can be emailed until this date. Each new purchase extends it.">customer · to ${monthYear(c.implied_until)}</span>`
      : c.implied_until ? '<span class="pill">expired</span>' : '<span class="pill">not on list</span>';
    shell("audience", `
      <div class="top"><h1 class="t">Audience</h1><div style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn ghost sm" href="/api/admin/contacts.csv">Export CSV</a><a class="btn" href="#send">✉ Send an update</a></div></div>
      <div class="stats">
        <div class="stat-card"><small>On mailing list</small><b class="lime">${onList.length}</b></div>
        <div class="stat-card"><small>All contacts</small><b>${contacts.length}</b></div>
        <div class="stat-card"><small>Attended an event</small><b>${contacts.filter((c) => c.attended).length}</b></div>
        <div class="stat-card"><small>With phone</small><b>${contacts.filter((c) => c.phone).length}</b></div>
      </div>
      ${campaigns.length ? `<h2 class="t" style="font-size:28px;margin:10px 0 12px">Sent updates</h2>
        <div class="tbl" style="margin-bottom:28px"><table><thead><tr><th>Subject</th><th>Audience</th><th>Sent</th><th>Date</th></tr></thead><tbody>
        ${campaigns.map((c) => { const a = JSON.parse(c.audience); return `<tr><td><b>${esc(c.subject)}</b>${c.event_title ? `<br><span class="muted">${esc(c.event_title)}</span>` : ""}</td>
          <td>${a.type === "event" ? "Ticket holders" : a.type === "post" ? "Blog post alert" : a.type === "city" ? esc(a.value) : "Mailing list"}</td>
          <td>${c.sent}/${c.total}${c.failed ? ` <span class="pill void">${c.failed} failed</span>` : ""} ${c.status === "sending" ? '<span class="pill new">sending…</span>' : ""}</td>
          <td class="muted">${fmtDate(c.created_at)}</td></tr>`; }).join("")}</tbody></table></div>` : ""}
      <div class="top" style="margin-bottom:12px"><h2 class="t" style="font-size:28px">Contacts</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><select id="flt" class="inline" style="padding:10px 14px"><option value="">Everyone</option><option value="list">On mailing list</option><option value="attended">Attended an event</option><option value="buyers">Bought tickets</option><option value="signup">Signed up on site</option><option value="booking">DJ booking clients</option><option value="unsub">Unsubscribed</option></select>
          <input id="q" placeholder="Search name, email, phone, city" style="max-width:300px"></div></div>
      <div class="tbl"><table><thead><tr><th>Contact</th><th>Phone</th><th>City</th><th>From</th><th>Tickets</th><th>Events attended</th><th>Updates</th><th>Last seen</th></tr></thead><tbody id="tb"></tbody></table></div>
      ${contacts.length ? "" : '<p class="muted" style="text-align:center;margin-top:20px">No contacts yet. Sign-ups, ticket buyers and booking clients will appear here.</p>'}`);
    const draw = () => {
      const t = document.getElementById("q").value.toLowerCase(), f = document.getElementById("flt").value;
      const match = { list: (c) => c.on_list, attended: (c) => c.attended > 0, buyers: (c) => c.tickets > 0, unsub: (c) => c.unsubscribed_at, signup: (c) => c.consent_at, booking: (c) => c.source === "booking" };
      document.getElementById("tb").innerHTML = contacts.filter((c) => (!f || match[f](c)) &&
        [c.name, c.email, c.phone, c.city].some((v) => String(v || "").toLowerCase().includes(t))).map((c) => `<tr>
        <td><b>${esc(c.name || "—")}</b><br><a class="lime" href="mailto:${esc(c.email)}">${esc(c.email)}</a></td>
        <td>${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : '<span class="muted">—</span>'}</td>
        <td>${esc(c.city || "")}</td><td class="muted">${esc(srcLabel[c.source] || c.source)}</td><td>${c.tickets || ""}</td>
        <td>${c.attended ? `<b class="lime">${c.attended}</b>` : ""}</td><td>${status(c)}</td>
        <td class="muted">${fmtDate(c.updated_at)}</td></tr>`).join("");
    };
    document.getElementById("q").oninput = draw; document.getElementById("flt").onchange = draw; draw();
  }

  async function sendPage() {
    const [sum, cities] = [await api("/api/admin/summary"), ["Hamilton", "Toronto", "Niagara"]];
    const events = sum.events;
    const upcoming = events.filter((e) => e.status === "published");
    shell("audience", `
      <div class="top"><div><a href="#audience" class="eyebrow" style="text-decoration:none">← Audience</a><h1 class="t" style="margin-top:8px">Send an update</h1></div></div>
      ${me.email ? "" : '<div class="banner" style="margin-bottom:20px">Email isn\'t set up yet, so you can write and preview, but sending needs SMTP settings on the server (see README).</div>'}
      <div class="ed-grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
        <form id="cf" novalidate>
          <div class="field"><label>Send to</label><select name="aud" id="aud">
            <option value="all|">Everyone on the mailing list</option>
            ${cities.map((c) => `<option value="city|${c}">Mailing list near ${c} (from sign-ups)</option>`).join("")}
            ${events.map((e) => `<option value="event|${e.id}">Ticket holders: ${esc(e.title)} (event update)</option>`).join("")}</select>
            <span class="hint" id="cnt"></span></div>
          <div class="field"><label>Subject <span class="req">*</span></label><input name="subject" required placeholder="e.g. Tickets are live for Entanglement 2027"></div>
          <div class="field"><label>Message <span class="req">*</span></label><textarea name="body" style="min-height:220px" placeholder="Write your update. Blank line = new paragraph. **bold**, [link](https://…), ## Heading"></textarea>
            <span class="hint">Each email starts with “Hey [first name],” automatically when we know their name.</span></div>
          <div class="field"><label>Feature an event</label><select name="eventId"><option value="">None</option>${upcoming.map((e) => `<option value="${e.id}">${esc(e.title)} · ${esc(e.when)}</option>`).join("")}</select>
            <span class="hint">Adds the flyer and a “Get tickets” button.</span></div>
          <div class="card" style="padding:16px;margin:18px 0">
            <div class="row2" style="align-items:end"><div class="field" style="margin:0"><label>Send a test to</label><input name="testTo" type="email" placeholder="your email"></div>
            <button type="button" class="btn ghost" id="test">Send test</button></div></div>
          <button class="btn lg block" id="send">Send update</button>
          <div class="form-msg" id="cm"></div>
        </form>
        <div><label style="display:block;margin-bottom:8px">Preview</label>
          <iframe id="pv" title="Email preview" style="width:100%;height:760px;border:1px solid var(--line-2);border-radius:16px;background:#08060d"></iframe></div>
      </div>`);
    const f = document.getElementById("cf"), msg = document.getElementById("cm");
    const audObj = () => { const [type, value] = f.aud.value.split("|"); return { type, value }; };
    const payload = () => ({ subject: f.subject.value, body: f.body.value, eventId: f.eventId.value || null, audience: audObj() });
    const count = async () => { const r = await api("/api/admin/campaigns/count", { method: "POST", body: { audience: audObj() } }); document.getElementById("cnt").textContent = `${r.count} ${r.count === 1 ? "person" : "people"} will get this`; return r.count; };
    let t; const preview = () => { clearTimeout(t); t = setTimeout(async () => {
      const r = await api("/api/admin/campaigns/preview", { method: "POST", body: { ...payload(), subject: f.subject.value || "Your subject here", body: f.body.value || "Your message here." } });
      document.getElementById("pv").srcdoc = r.html; }, 250); };
    f.addEventListener("input", preview); f.aud.onchange = count; f.eventId.onchange = preview;
    count(); preview();
    document.getElementById("test").onclick = async () => {
      msg.className = "form-msg"; msg.textContent = "Sending test…";
      try { await api("/api/admin/campaigns", { method: "POST", body: { ...payload(), testTo: f.testTo.value } }); msg.className = "form-msg ok"; msg.textContent = "Test sent to " + f.testTo.value; }
      catch (err) { msg.className = "form-msg err"; msg.textContent = err.message; }
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const n = await count();
      if (!f.subject.value.trim() || !f.body.value.trim()) { msg.className = "form-msg err"; msg.textContent = "Add a subject and a message"; return; }
      if (!confirm(`Send "${f.subject.value}" to ${n} ${n === 1 ? "person" : "people"}?`)) return;
      const btn = document.getElementById("send"); btn.disabled = true;
      try { const r = await api("/api/admin/campaigns", { method: "POST", body: payload() }); WN.toast(`Sending to ${r.total}…`); location.hash = "audience"; }
      catch (err) { msg.className = "form-msg err"; msg.textContent = err.message; btn.disabled = false; }
    };
  }

  // ---------- Blog ----------
  async function blogList() {
    const posts = await api("/api/admin/posts");
    shell("blog", `
      <div class="top"><h1 class="t">Blog</h1><div style="display:flex;gap:10px"><a class="btn ghost sm" href="/blog" target="_blank">View blog ↗</a><a class="btn" href="#post/new">+ New post</a></div></div>
      ${posts.length ? posts.map((p) => `<a class="ev-row" href="#post/${p.id}">
        <div class="th" style="height:64px;${p.cover ? `background-image:url('${esc(p.cover)}')` : ""}"></div>
        <div><h3>${esc(p.title)} <span class="pill ${p.status}">${p.status}</span></h3>
          <div class="m">${esc(p.published_at)}${p.tag ? " · " + esc(p.tag) : ""}</div></div>
        <span class="lime">→</span></a>`).join("") : '<div class="empty-state"><h3>No posts yet</h3><p>Write your first recap or announcement.</p></div>'}`);
  }

  async function postEditor(id) {
    const isNew = id === "new";
    const p = isNew ? { status: "draft", published_at: new Date().toISOString().slice(0, 10), body: "" } : await api("/api/admin/posts/" + id);
    shell("blog", `
      <div class="top"><div><a href="#blog" class="eyebrow" style="text-decoration:none">← Blog</a><h1 class="t" style="margin-top:8px">${isNew ? "New post" : esc(p.title)}</h1></div>
        ${!isNew && p.status === "published" ? `<a class="btn ghost sm" href="/blog/${esc(p.slug)}" target="_blank">View post ↗</a>` : ""}</div>
      <form id="pf" novalidate><div class="ed-grid">
        <div>
          <label class="flyer-drop ${p.cover ? "has" : ""}" id="drop" style="aspect-ratio:4/3;${p.cover ? `background-image:url('${esc(p.cover)}')` : ""}">
            <span>${p.cover ? "Change cover" : "Upload cover image"}</span><input type="file" accept="image/*" id="file" hidden></label>
          <input type="hidden" name="cover" value="${esc(p.cover || "")}">
          <div class="field" style="margin-top:16px"><label>Status</label><select name="status"><option value="draft">Draft (hidden)</option><option value="published">Published</option></select></div>
          <div class="field"><label>Date</label><input type="date" name="published_at" value="${esc(p.published_at || "")}"></div>
          <div class="field"><label>Tag</label><input name="tag" value="${esc(p.tag || "")}" placeholder="e.g. Toronto, Recap, News" list="tags"></div>
          <datalist id="tags"><option>Video</option><option>Mix</option><option>Recap</option><option>Lineup</option><option>News</option><option>Hamilton</option><option>Toronto</option><option>Niagara</option></datalist>
          <div class="card" style="padding:16px;font-size:13px;color:var(--muted);margin-top:8px"><b style="color:var(--text)">Formatting</b><br>
            Blank line = new paragraph<br>## Heading<br>**bold** · *italic*<br>[link text](https://…)<br>> Pull quote<br>- bullet list<br>
            Paste a YouTube, SoundCloud, Mixcloud or Spotify link on its own line to embed it<br>Images: use “Insert image” below<br>No cover? Video posts use the YouTube thumbnail</div>
        </div>
        <div>
          <div class="field"><label>Title <span class="req">*</span></label><input name="title" required value="${esc(p.title || "")}" placeholder="e.g. Euphoria 2022: the recap"></div>
          <div class="field"><label>Short summary</label><input name="excerpt" value="${esc(p.excerpt || "")}" placeholder="Optional. Shown in the blog list (otherwise the first lines are used)"></div>
          <div class="field">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><label for="body">Post</label>
              <span style="display:flex;gap:8px"><button type="button" class="btn ghost sm" id="insImg">Insert image</button><button type="button" class="btn ghost sm" id="prev">Preview</button></span></div>
            <textarea id="body" name="body" style="min-height:380px;font-size:16px;line-height:1.6">${esc(p.body || "")}</textarea>
            <div class="prose card" id="preview" hidden style="font-size:17px;max-width:none"></div>
            <input type="file" accept="image/*" id="imgFile" hidden>
          </div>
          <div class="field"><label>Page URL</label><input name="slug" value="${esc(p.slug || "")}" placeholder="auto from title"><span class="hint">yoursite.com/blog/<b>${esc(p.slug || "…")}</b></span></div>
        </div></div>
        <div class="sticky-save">
          ${p.notified_at ? `<span class="muted" style="font-size:14px">✉ Mailing list emailed ${fmtDate(p.notified_at)}</span>`
            : `<label class="optin" style="margin:0 8px 0 0"><input type="checkbox" name="notify" value="1" ${isNew || p.status !== "published" ? "checked" : ""}> Email my mailing list when this is published</label>`}
          <button class="btn">${isNew ? "Create post" : "Save changes"}</button>
          ${isNew ? "" : '<button type="button" class="btn ghost sm" id="del" style="margin-left:auto">Delete post</button>'}
          <span class="form-msg" id="pm" style="margin:0"></span></div></form>`);
    const f = document.getElementById("pf"), msg = document.getElementById("pm"), body = document.getElementById("body");
    f.status.value = p.status || "draft";
    const upload = async (file) => { const r = await api("/api/admin/upload", { method: "POST", body: { dataUrl: await shrink(file, 1800) } }); return r.url; };
    document.getElementById("file").onchange = async (e) => {
      if (!e.target.files[0]) return; msg.className = "form-msg"; msg.textContent = "Uploading…";
      try { const url = await upload(e.target.files[0]); f.cover.value = url; const d = document.getElementById("drop"); d.style.backgroundImage = `url('${url}')`; d.classList.add("has"); d.querySelector("span").textContent = "Change cover"; msg.textContent = "Cover uploaded. Save to keep it."; }
      catch (err) { msg.className = "form-msg err"; msg.textContent = err.message; }
    };
    document.getElementById("insImg").onclick = () => document.getElementById("imgFile").click();
    document.getElementById("imgFile").onchange = async (e) => {
      if (!e.target.files[0]) return; msg.className = "form-msg"; msg.textContent = "Uploading image…";
      try {
        const url = await upload(e.target.files[0]), at = body.selectionStart ?? body.value.length;
        body.value = body.value.slice(0, at) + `\n\n![](${url})\n\n` + body.value.slice(at); msg.textContent = "Image added.";
      } catch (err) { msg.className = "form-msg err"; msg.textContent = err.message; }
      e.target.value = "";
    };
    document.getElementById("prev").onclick = (e) => {
      const pv = document.getElementById("preview"), showing = !pv.hidden;
      pv.hidden = showing; body.hidden = !showing; e.target.textContent = showing ? "Preview" : "Edit";
      if (!showing) pv.innerHTML = WNBlog.render(body.value) || '<p class="muted">Nothing to preview yet.</p>';
    };
    const del = document.getElementById("del");
    if (del) del.onclick = async () => { if (!confirm("Delete this post permanently?")) return; await api("/api/admin/posts/" + p.id, { method: "DELETE" }); location.hash = "blog"; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(f));
        if (data.notify && data.status === "published" && !confirm("Publish and email your mailing list about this post?")) return;
        const r = await api(isNew ? "/api/admin/posts" : "/api/admin/posts/" + p.id, { method: isNew ? "POST" : "PUT", body: data });
        if (r.notify && r.notify.error) alert(r.notify.error);
        WN.toast(r.notify && r.notify.sent ? `Published · emailing ${r.notify.sent} people` : "Saved");
        if (isNew) location.hash = "post/" + r.id; else postEditor(p.id);
      } catch (err) { msg.className = "form-msg err"; msg.textContent = err.message; }
    };
  }

  async function messages() {
    const list = await api("/api/admin/messages");
    shell("messages", `<div class="top"><h1 class="t">Messages</h1></div>
      ${list.length ? list.map((m) => `<div class="card" style="margin-bottom:10px;padding:18px">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>${esc(m.subject || "(no subject)")}</b><span class="muted" style="font-size:13px">${fmtDate(m.created_at)}</span></div>
        <div class="muted" style="font-size:14px;margin:4px 0 10px">${esc(m.name)} · <a class="lime" href="mailto:${esc(m.email)}?subject=${encodeURIComponent("Re: " + (m.subject || "your message"))}">${esc(m.email)}</a></div>
        <div style="white-space:pre-line">${esc(m.message)}</div></div>`).join("") : '<div class="empty-state"><h3>No messages</h3><p>Messages from the contact page show up here.</p></div>'}`);
  }

  async function render() {
    me = await api("/api/admin/me");
    if (!me.signedIn) return login();
    const r = route();
    try {
      if (r.startsWith("event/")) await eventPage(r.split("/")[1]);
      else if (r === "bookings") await bookings();
      else if (r === "messages") await messages();
      else if (r === "blog") await blogList();
      else if (r === "audience") await audiencePage();
      else if (r === "send") await sendPage();
      else if (r.startsWith("post/")) await postEditor(r.split("/")[1]);
      else await dashboard();
    } catch (e) { if (/signed in/i.test(e.message)) return login(); app.innerHTML = `<div class="wrap"><div class="empty-state" style="margin-top:60px">${esc(e.message)}</div></div>`; }
    scrollTo(0, 0);
  }
  addEventListener("hashchange", render);
  render();
})();
