/* DJ pricing, shared by the booking form (estimate), the server (suggested quote)
   and the invoice (final price you confirm in /admin).

   DJ time (hours × rate for the event type)
   + event-type extra (e.g. wedding planning)
   + sound for the crowd + mics + extras + any custom lines you add
   + travel from Hamilton
   − discount (referral %, applied to DJ time only, never below the floor rate)
   then raised to the area minimum if needed, plus HST if registered. */
(function (root) {
  const round2 = (n) => Math.round(n * 100) / 100;
  function perKm(t) { return (t.fuelPrice * t.litresPer100km) / 100 + t.wearPerKm; }

  function travelFor(cfg, cityName) {
    const t = cfg.travel;
    const city = t.cities.find((c) => c.name === cityName);
    if (!city) return { city: null, charge: 0, custom: false, home: true };
    if (city.km === null) return { city, charge: 0, custom: true, home: false };
    if (city.km === 0) return { city, charge: 0, custom: false, home: true, roundTripKm: 0 };
    const roundTripKm = city.km * 2;
    const raw = roundTripKm * perKm(t);
    const charge = Math.ceil(raw / t.roundTo) * t.roundTo + (city.extra || 0);
    return { city, charge, custom: false, home: false, roundTripKm, raw: round2(raw), perKm: Math.round(perKm(t) * 1000) / 1000 };
  }

  function soundFor(cfg, guests, venueSound) {
    const n = Number(guests) || 0;
    const tier = cfg.soundTiers.find((s) => n <= s.upTo) || cfg.soundTiers[cfg.soundTiers.length - 1];
    if (venueSound === "yes") return { label: "Using the venue's sound system", price: 0, tier };
    return { label: tier.label, price: tier.price, tier };
  }

  /** v: booking details. Optional overrides (used for the final invoice):
   *  v.rate, v.discountPct, v.adjustments [{label, amount}], v.travelCharge */
  function calculate(cfg, v) {
    const type = cfg.eventTypes[v.type];
    if (!type) return { ready: false, lines: [], total: 0 };
    const hours = Math.min(cfg.maximumHours, Math.max(1, Number(v.hours) || cfg.defaultHours));
    const customType = !!type.custom && v.rate == null;
    const rate = v.rate != null && v.rate !== "" ? Number(v.rate) : type.rate || cfg.hourlyRate;
    const lines = [];
    if (customType) {
      // Whole-event sound/entertainment: you build this quote yourself in /admin.
      return { ready: true, customType: true, hours, rate: null, lines: [{ label: `${type.label}: custom quote`, amount: 0 }], subtotal: 0, discount: 0, discountPct: 0,
        minimum: 0, minApplied: false, total: 0, hst: 0, grandTotal: 0, fullPrice: 0, travel: travelFor(cfg, v.city), sound: soundFor(cfg, v.guests, v.venueSound),
        referred: !!String(v.referral || "").trim(), custom: false, deposit: cfg.deposit || 0 };
    }
    lines.push({ label: `DJ: ${hours} hrs × $${rate}`, amount: hours * rate, dj: true });
    if (type.extra && !customType) lines.push({ label: type.extraLabel || type.label, amount: type.extra });

    const range = (cfg.guestRanges.find((g) => String(g.value) === String(v.guests)) || {}).label;
    const sound = soundFor(cfg, v.guests, v.venueSound);
    lines.push({ label: `Sound: ${sound.label}${range ? ` (${range} guests)` : ""}${v.venueSound === "unsure" ? ", venue sound unknown" : ""}`, amount: sound.price });

    const mic = (cfg.mics || []).find((m) => String(m.count) === String(v.mics || 0));
    if (mic && mic.count) lines.push({ label: mic.label, amount: mic.price });
    const picked = [].concat(v.extras || []);
    for (const x of cfg.extras) if (picked.includes(x.name)) lines.push({ label: x.name, amount: x.price });
    for (const a of [].concat(v.adjustments || [])) if (a && a.label && Number(a.amount)) lines.push({ label: String(a.label), amount: round2(Number(a.amount)) });

    const travel = travelFor(cfg, v.city);
    const travelCharge = v.travelCharge != null && v.travelCharge !== "" ? Number(v.travelCharge) : travel.charge;
    if (travelCharge) lines.push({ label: travel.city && !travel.custom ? `Travel: ${travel.city.name} (${travel.roundTripKm} km round trip${travel.city.extra ? ` + $${travel.city.extra} parking/traffic` : ""})` : `Travel${v.location ? ": " + v.location : ""}`, amount: travelCharge });

    const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));

    // Discount: explicit % from /admin, otherwise the referral % if they were referred.
    const referred = !!String(v.referral || "").trim();
    let discountPct = v.discountPct != null && v.discountPct !== "" ? Number(v.discountPct) : referred && !type.noReferral ? cfg.referralPercent : 0;
    const djAmount = customType ? 0 : hours * rate;
    const maxDiscount = Math.max(0, hours * (rate - cfg.floorRate)); // never below the floor rate
    let discount = Math.floor(Math.min((djAmount * discountPct) / 100, maxDiscount) / 5) * 5; // clean $5 steps
    if (discount) lines.push({ label: `${referred && v.discountPct == null ? "Referral discount" : "Discount"} (${discountPct}% off DJ time)`, amount: -discount, discount: true });

    const minimum = customType ? 0 : travel.city && travel.city.min != null ? travel.city.min : travel.home ? cfg.minimums.hamilton : cfg.minimums.outside;
    let total = round2(subtotal - discount);
    const minApplied = total < minimum;
    if (minApplied) { lines.push({ label: `Minimum booking ${travel.home ? "in Hamilton" : "outside Hamilton"} ($${minimum})`, amount: round2(minimum - total), minimum: true }); total = minimum; }

    const hst = cfg.contract && cfg.contract.hst && cfg.contract.hst.registered ? round2((total * cfg.contract.hst.rate) / 100) : 0;
    return {
      ready: true, hours, rate, lines, subtotal, discount, discountPct: discount ? discountPct : 0, minimum, minApplied,
      total, hst, grandTotal: round2(total + hst), fullPrice: round2(Math.max(subtotal, minimum)),
      travel, sound, referred, customType,
      custom: travel.custom && !travelCharge, // travel still to be quoted by hand
      deposit: cfg.deposit || 0,
    };
  }

  root.WNPricing = { calculate, travelFor, soundFor, perKm };
  if (typeof module !== "undefined") module.exports = root.WNPricing;
})(typeof window !== "undefined" ? window : globalThis);
