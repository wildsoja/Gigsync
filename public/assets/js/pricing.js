/* Suggested DJ quote: hours × rate + travel from Hamilton, with an optional referral price.
   Used by the server for the admin view. Clients never see it. */
(function (root) {
  function perKm(t) { return (t.fuelPrice * t.litresPer100km) / 100 + t.wearPerKm; }

  function travelFor(cfg, cityName) {
    const t = cfg.travel;
    const city = t.cities.find((c) => c.name === cityName);
    if (!city) return { city: null, charge: 0, custom: false };
    if (city.km === null) return { city, charge: 0, custom: true };
    if (city.km === 0) return { city, charge: 0, custom: false, roundTripKm: 0 };
    const roundTripKm = city.km * 2;
    const raw = roundTripKm * perKm(t);
    const charge = Math.ceil(raw / t.roundTo) * t.roundTo + (city.extra || 0);
    return { city, charge, custom: false, roundTripKm, raw: Math.round(raw * 100) / 100, perKm: Math.round(perKm(t) * 1000) / 1000 };
  }

  function calculate(cfg, v) {
    if (!cfg.eventTypes[v.type]) return { ready: false, lines: [], total: 0 };
    const hours = Math.min(cfg.maximumHours, Math.max(cfg.minimumHours, Number(v.hours) || cfg.defaultHours));
    const lines = [{ label: `DJ: ${hours} hrs × $${cfg.hourlyRate}`, amount: hours * cfg.hourlyRate }];
    const travel = travelFor(cfg, v.city);
    if (travel.charge) lines.push({ label: `Travel: ${travel.city.name} (${travel.roundTripKm} km round trip${travel.city.extra ? ` + $${travel.city.extra} parking/traffic` : ""})`, amount: travel.charge });
    const total = lines.reduce((s, l) => s + l.amount, 0);
    const referred = !!String(v.referral || "").trim();
    return {
      ready: true, hours, lines, total, travel,
      custom: travel.custom,                       // travel must be quoted by hand
      referred, referralTotal: Math.max(0, total - cfg.referralDiscount),
    };
  }

  root.WNPricing = { calculate, travelFor, perKm };
  if (typeof module !== "undefined") module.exports = root.WNPricing;
})(typeof window !== "undefined" ? window : globalThis);
