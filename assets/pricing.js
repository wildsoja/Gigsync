/* Pricing engine: pure function, takes form values + config, returns a quote. */
(function(root){
  function guestTier(cfg, guests){
    for (var i=0;i<cfg.guestTiers.length;i++) if (guests <= cfg.guestTiers[i].max) return cfg.guestTiers[i];
    return cfg.guestTiers[cfg.guestTiers.length-1];
  }
  function parseDate(s){ if(!s) return null; var p=s.split("-"); return new Date(+p[0], +p[1]-1, +p[2]); }

  function calculate(cfg, v){
    var lines = [], custom = false, subtotal = 0;
    var type = cfg.eventTypes[v.type];
    if (!type) return { lines:[], subtotal:0, total:0, deposit:0, custom:false, ready:false };

    lines.push({ label: type.label + " (" + cfg.includedHours + " hrs)", amount: type.base });
    subtotal += type.base;

    var hours = Number(v.hours) || cfg.includedHours;
    var extra = Math.max(0, hours - cfg.includedHours);
    if (extra > 0){
      var amt = extra * type.hourly;
      lines.push({ label: "Extra time (" + extra + " hr" + (extra===1?"":"s") + " × $" + type.hourly + ")", amount: amt });
      subtotal += amt;
    }

    var guests = Number(v.guests) || 0;
    if (guests > 0){
      var tier = guestTier(cfg, guests);
      if (tier.add) { lines.push({ label: "Crowd size (" + tier.label + " guests)", amount: tier.add }); subtotal += tier.add; }
    }

    (v.addOns || []).forEach(function(k){
      var a = cfg.addOns[k];
      if (a){ lines.push({ label: a.label, amount: a.price }); subtotal += a.price; }
    });

    var zone = cfg.travelZones[v.travel];
    if (zone){
      if (zone.add === null) custom = true;
      else if (zone.add > 0){ lines.push({ label: "Travel (" + zone.label + ")", amount: zone.add }); subtotal += zone.add; }
    }

    // Date-based surcharges are a percentage of everything above.
    var s = cfg.surcharges, d = parseDate(v.date), pct = 0, base = subtotal;
    if (d){
      var mmdd = ("0"+(d.getMonth()+1)).slice(-2) + "-" + ("0"+d.getDate()).slice(-2);
      if (s.holidays.indexOf(mmdd) >= 0){
        lines.push({ label: "Holiday date (+" + s.holidayPercent + "%)", amount: Math.round(base * s.holidayPercent/100) });
        pct += s.holidayPercent;
      } else if (d.getDay() === 5 || d.getDay() === 6){
        lines.push({ label: "Friday / Saturday (+" + s.weekendPercent + "%)", amount: Math.round(base * s.weekendPercent/100) });
        pct += s.weekendPercent;
      }
      var today = new Date(); today.setHours(0,0,0,0);
      var days = Math.round((d - today) / 86400000);
      if (days >= 0 && days < s.rushDays){
        lines.push({ label: "Short notice, under " + s.rushDays + " days (+" + s.rushPercent + "%)", amount: Math.round(base * s.rushPercent/100) });
        pct += s.rushPercent;
      }
    }
    var total = lines.reduce(function(t,l){ return t + l.amount; }, 0);
    return {
      lines: lines, subtotal: base, total: total,
      deposit: Math.round(total * cfg.depositPercent / 100),
      custom: custom, ready: true
    };
  }

  root.WNPricing = { calculate: calculate };
  if (typeof module !== "undefined") module.exports = root.WNPricing;
})(typeof window !== "undefined" ? window : globalThis);
