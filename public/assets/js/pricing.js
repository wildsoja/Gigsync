/* Suggested DJ quote (only you see it):
   hours × rate + sound for the crowd + extras + travel from Hamilton,
   never below the minimum for the area, with an optional referral price. */
(function (root) {
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
    return { city, charge, custom: false, home: false, roundTripKm, raw: Math.round(raw * 100) / 100, perKm: Math.round(perKm(t) * 1000) / 1000 };
  }

  function soundFor(cfg, guests, venueSound) {
    const n = Number(guests) || 0;
    const tier = cfg.soundTiers.find((s) => n <= s.upTo) || cfg.soundTiers[cfg.soundTiers.length - 1];
    if (venueSound === "yes") return { label: "Using the venue's sound system", price: 0, tier };
    return { label: tier.label, price: tier.price, tier };
  }

  function calculate(cfg, v) {
    const type = cfg.eventTypes[v.type];
    if (!type) return { ready: false, lines: [], total: 0 };
    const hours = Math.min(cfg.maximumHours, Math.max(cfg.minimumHours, Number(v.hours) || cfg.defaultHours));
    const lines = [{ label: `DJ: ${hours} hrs × $${cfg.hourlyRate}`, amount: hours * cfg.hourlyRate }];
    if (type.extra) lines.push({ label: type.label, amount: type.extra });

    const range = (cfg.guestRanges.find((g) => String(g.value) === String(v.guests)) || {}).label;
    const sound = soundFor(cfg, v.guests, v.venueSound);
    lines.push({ label: `Sound: ${sound.label}${range ? ` (${range} guests)` : ""}${v.venueSound === "unsure" ? ", venue sound unknown" : ""}`, amount: sound.price });

    const mic = (cfg.mics || []).find((m) => String(m.count) === String(v.mics || 0));
    if (mic && mic.count) lines.push({ label: mic.label, amount: mic.price });

    const picked = [].concat(v.extras || []);
    for (const x of cfg.extras) if (picked.includes(x.name)) lines.push({ label: x.name, amount: x.price });

    const travel = travelFor(cfg, v.city);
    if (travel.charge) lines.push({ label: `Travel: ${travel.city.name} (${travel.roundTripKm} km round trip${travel.city.extra ? ` + $${travel.city.extra} parking/traffic` : ""})`, amount: travel.charge });

    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const minimum = travel.city && travel.city.min != null ? travel.city.min : travel.home ? cfg.minimums.hamilton : cfg.minimums.outside;
    const minApplied = subtotal < minimum;
    if (minApplied) lines.push({ label: `Minimum booking ${travel.home ? "in Hamilton" : "outside Hamilton"} ($${minimum})`, amount: minimum - subtotal, minimum: true });
    const total = Math.max(subtotal, minimum);
    const referred = !!String(v.referral || "").trim();
    return {
      ready: true, hours, lines, subtotal, total, minimum, minApplied, travel, sound,
      custom: travel.custom, // travel must be quoted by hand
      referred, referralTotal: referred ? Math.max(minimum, total - cfg.referralDiscount) : total,
      referralSaves: referred ? total - Math.max(minimum, total - cfg.referralDiscount) : 0, // 0 when already at the minimum
      deposit: cfg.deposit || 0,
    };
  }

  root.WNPricing = { calculate, travelFor, soundFor, perKm };
  if (typeof module !== "undefined") module.exports = root.WNPricing;
})(typeof window !== "undefined" ? window : globalThis);
