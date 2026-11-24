/* DJ booking form. No prices shown; the server works out a suggested quote for /admin. */
(function () {
  const C = window.WN_CONFIG, form = document.getElementById("booking"), $ = (id) => document.getElementById(id);
  const DRAFT = "wn-booking-draft-v2";

  $("type").insertAdjacentHTML("beforeend", Object.entries(C.eventTypes).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join(""));
  $("city").insertAdjacentHTML("beforeend", C.travel.cities.map((c) => `<option>${c.name}</option>`).join(""));
  for (let h = C.minimumHours; h <= C.maximumHours; h++) $("hours").insertAdjacentHTML("beforeend", `<option value="${h}" ${h === C.defaultHours ? "selected" : ""}>${h} hours</option>`);
  $("guests").insertAdjacentHTML("beforeend", C.guestRanges.map((g) => `<option value="${g.value}">${g.label}</option>`).join(""));
  $("mics").innerHTML = C.mics.map((m) => `<option value="${m.count}">${m.label}</option>`).join("");
  document.querySelectorAll(".bkEmail").forEach((el) => { el.textContent = C.bookingEmail; if (el.href) el.href = "mailto:" + C.bookingEmail; });
  if ($("depAmt")) $("depAmt").textContent = "$" + C.deposit;

  // Rough estimate once the key details are in. The final price comes from Wild Soja.
  function updateEstimate() {
    const box = $("estimate");
    if (!C.showEstimate || !window.WNPricing) return;
    const v = values();
    if (!v.type || !v.guests || !v.city) { box.hidden = true; return; }
    const q = WNPricing.calculate(C, v);
    const price = q.referred && q.referralSaves > 0 ? q.referralTotal : q.total;
    $("estAmount").textContent = "$" + price + (q.custom ? " + travel" : "");
    $("estNote").textContent = (q.referred && q.referralSaves > 0 ? "Referral discount included. " : "") +
      (q.custom ? "Travel is added once we know where you are. " : "") +
      "Includes DJ, sound for your crowd, equipment and travel. Your final price is confirmed in your quote.";
    box.hidden = false;
  }
  $("extras").innerHTML = C.extras.map((x) => `<label class="extra"><input type="checkbox" name="extras" value="${x.name}"><span>${x.name}</span></label>`).join("");
  const tomorrow = new Date(Date.now() + 864e5); $("date").min = tomorrow.toISOString().slice(0, 10);
  const toggleOther = () => { $("otherCity").hidden = !/else/i.test($("city").value); };
  $("city").addEventListener("change", toggleOther);

  function values() {
    const v = { extras: [] };
    new FormData(form).forEach((val, key) => { key === "extras" ? v.extras.push(val) : (v[key] = val); });
    return v;
  }
  // Restore a half-filled form, then apply ?type=wedding style links.
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT) || "{}");
    new URLSearchParams(location.search).forEach((val, key) => (saved[key] = val));
    for (const [k, val] of Object.entries(saved)) {
      if (k === "_gotcha" || k === "noUpdates") continue;
      if (k === "extras") form.querySelectorAll('[name="extras"]').forEach((el) => (el.checked = [].concat(val).includes(el.value)));
      else if (form.elements[k] && form.elements[k].type !== "checkbox") form.elements[k].value = val;
    }
  } catch (e) {}
  toggleOther();
  updateEstimate();
  form.addEventListener("input", () => { updateEstimate(); try { localStorage.setItem(DRAFT, JSON.stringify(values())); } catch (e) {} });
  form.addEventListener("change", updateEstimate);

  function setErr(el, bad) { const f = el.closest(".field"); if (f) f.classList.toggle("has-err", bad); el.classList.toggle("invalid", bad); }
  function validate() {
    let first = null;
    for (const id of ["type", "date", "city", "guests", "name", "phone", "email"]) {
      const el = $(id); let bad = !el.value.trim();
      if (id === "email") bad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim());
      if (id === "date" && !bad) bad = el.value < el.min;
      setErr(el, bad); if (bad && !first) first = el;
    }
    if (first) { first.scrollIntoView({ behavior: "smooth", block: "center" }); first.focus({ preventScroll: true }); }
    return !first;
  }
  form.addEventListener("change", (e) => e.target.closest(".field") && setErr(e.target, false));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (form.elements._gotcha.value || !validate()) return;
    const btn = $("submitBtn"); btn.disabled = true; btn.textContent = "Sending…"; $("formErr").textContent = "";
    try {
      const r = await WN.api(C.formEndpoint, { method: "POST", body: values() });
      form.style.display = "none"; $("success").style.display = "block"; $("refNum").textContent = "Ref " + r.ref;
      const first = $("name").value.trim().split(/\s+/)[0];
      $("successMsg").textContent = `Thanks ${first}! We'll check the date and get back to you with your quote, usually within 24 hours.`;
      try { localStorage.removeItem(DRAFT); } catch (e) {}
      scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      btn.disabled = false; btn.textContent = "Request a quote";
      $("formErr").textContent = err.message + ". You can also email " + C.bookingEmail + " or text " + C.brand.phone;
    }
  });
})();
