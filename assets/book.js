(function(){
  var C = window.WN_CONFIG, P = window.WNPricing;
  var fmt = new Intl.NumberFormat("en-US",{style:"currency",currency:C.currency,maximumFractionDigits:0});
  var form = document.getElementById("booking"), $ = function(id){ return document.getElementById(id); };
  var DRAFT_KEY = "wn-booking-draft";

  // ---- Build dynamic inputs from config ----
  var et = $("eventTypes");
  Object.keys(C.eventTypes).forEach(function(k){
    var t = C.eventTypes[k], l = document.createElement("label");
    l.className = "chip";
    l.innerHTML = '<input type="radio" name="type" value="'+k+'"><span></span>';
    l.querySelector("span").innerHTML = "<span></span><small>from " + fmt.format(t.base) + "</small>";
    l.querySelector("span span").textContent = t.label;
    et.appendChild(l);
  });

  var ad = $("addons");
  Object.keys(C.addOns).forEach(function(k){
    var a = C.addOns[k], l = document.createElement("label");
    l.className = "addon";
    l.innerHTML = '<input type="checkbox" name="addOns" value="'+k+'"><span class="name"></span><span class="p"></span>';
    l.querySelector(".name").textContent = a.label;
    if (a.note){ var s=document.createElement("small"); s.textContent=a.note; l.querySelector(".name").appendChild(s); }
    l.querySelector(".p").textContent = "+" + fmt.format(a.price);
    ad.appendChild(l);
  });

  var tr = $("travel");
  tr.innerHTML = '<option value="">Select distance</option>';
  Object.keys(C.travelZones).forEach(function(k){
    var z = C.travelZones[k], o = document.createElement("option");
    o.value = k; o.textContent = z.label + (z.add === null ? " (custom quote)" : z.add ? " (+" + fmt.format(z.add) + ")" : " (free)");
    tr.appendChild(o);
  });

  var hrs = $("hours");
  hrs.min = C.minimumHours; hrs.max = C.maximumHours; hrs.value = C.includedHours;
  $("hoursHint").textContent = C.includedHours + " hours included in every package. Extra time is billed hourly.";

  var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  $("date").min = tomorrow.toISOString().slice(0,10);
  $("yr").textContent = new Date().getFullYear();
  $("depositLabel").textContent = C.depositPercent + "% deposit to book";

  // ---- Read values ----
  function values(){
    var fd = new FormData(form), v = {};
    fd.forEach(function(val, key){
      if (key === "addOns"){ (v.addOns = v.addOns || []).push(val); }
      else v[key] = val;
    });
    v.addOns = v.addOns || [];
    return v;
  }

  // ---- Render quote ----
  function render(){
    var v = values(), q = P.calculate(C, v);
    $("hoursVal").textContent = v.hours;
    var ul = $("lines"); ul.innerHTML = "";
    if (!q.ready){
      ul.innerHTML = '<li class="empty">Pick an event type to start</li>';
    } else {
      q.lines.forEach(function(l){
        var li = document.createElement("li");
        li.innerHTML = "<span></span><span></span>";
        li.children[0].textContent = l.label;
        li.children[1].textContent = fmt.format(l.amount);
        ul.appendChild(li);
      });
    }
    var totalText = fmt.format(q.total) + (q.custom ? " + travel" : "");
    $("total").textContent = fmt.format(q.total);
    $("mTotal").textContent = totalText;
    $("deposit").textContent = fmt.format(q.deposit);
    $("customFlag").style.display = q.custom ? "block" : "none";
    saveDraft(v);
    return q;
  }

  // ---- Drafts & URL prefill ----
  function saveDraft(v){ try { localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); } catch(e){} }
  function loadDraft(){
    var v = null; try { v = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch(e){}
    var params = new URLSearchParams(location.search);
    v = v || {};
    params.forEach(function(val, key){ v[key] = key === "addOns" ? val.split(",") : val; });
    Object.keys(v).forEach(function(key){
      if (key === "_gotcha") return;
      var els = form.elements[key];
      if (!els) return;
      if (els instanceof RadioNodeList || (els.length && els[0] && els[0].type)){
        Array.prototype.forEach.call(els, function(el){
          if (el.type === "checkbox") el.checked = (v[key]||[]).indexOf(el.value) >= 0;
          else if (el.type === "radio") el.checked = el.value === v[key];
        });
      } else if (els.type === "checkbox"){ els.checked = (v[key]||[]).indexOf(els.value) >= 0; }
      else els.value = v[key];
    });
  }

  // ---- Validation ----
  function setErr(el, bad){
    var f = el.closest(".field"); if (f) f.classList.toggle("has-err", bad);
    if (el.classList) el.classList.toggle("invalid", bad);
  }
  function validate(){
    var ok = true, first = null;
    ["name","email","phone","date","startTime","guests","location","travel"].forEach(function(id){
      var el = $(id), bad = !el.value.trim();
      if (id === "email") bad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim());
      if (id === "guests") bad = !(Number(el.value) > 0);
      if (id === "date" && !bad) bad = el.value < el.min;
      setErr(el, bad); if (bad){ ok = false; first = first || el; }
    });
    var typeChecked = !!form.querySelector('input[name="type"]:checked');
    et.closest(".field").classList.toggle("has-err", !typeChecked);
    if (!typeChecked){ ok = false; first = first || et; }
    if (first){ first.scrollIntoView({behavior:"smooth", block:"center"}); if (first.focus) first.focus({preventScroll:true}); }
    return ok;
  }

  // ---- Submission ----
  function refNumber(){
    var d = new Date(), p = function(n){ return ("0"+n).slice(-2); };
    return "WN-" + String(d.getFullYear()).slice(2) + p(d.getMonth()+1) + p(d.getDate()) + "-" + Math.random().toString(36).slice(2,6).toUpperCase();
  }
  function summary(v, q, ref){
    var t = C.eventTypes[v.type], z = C.travelZones[v.travel];
    var out = [
      "BOOKING REQUEST " + ref, "",
      "CLIENT", "Name: " + v.name, "Email: " + v.email, "Phone: " + v.phone, "Prefers: " + v.contactPref, "",
      "EVENT", "Type: " + (t ? t.label : v.type), "Name: " + (v.eventName || "-"), "Date: " + v.date + " at " + v.startTime,
      "Hours: " + v.hours, "Guests: " + v.guests, "",
      "VENUE", "Venue: " + (v.venue || "TBD"), "Location: " + v.location, "Setting: " + v.setting,
      "Distance: " + (z ? z.label : "-"), "Load-in: " + (v.loadIn || "-"), "",
      "ADD-ONS", (v.addOns.length ? v.addOns.map(function(k){ return "- " + C.addOns[k].label; }).join("\n") : "None"), "",
      "MUSIC", "Genres: " + (v.genres || "-"), "Must-play: " + (v.mustPlay || "-"), "Do-not-play: " + (v.doNotPlay || "-"), "",
      "OTHER", "Budget: " + (v.budget || "-"), "Heard via: " + (v.referral || "-"), "Notes: " + (v.notes || "-"), "",
      "ESTIMATE"
    ];
    q.lines.forEach(function(l){ out.push(l.label + ": " + fmt.format(l.amount)); });
    out.push("TOTAL: " + fmt.format(q.total) + (q.custom ? " + travel (custom)" : ""));
    out.push("Deposit (" + C.depositPercent + "%): " + fmt.format(q.deposit));
    return out.join("\n");
  }

  function showSuccess(ref, viaEmail){
    form.style.display = "none";
    $("success").style.display = "block";
    $("refNum").textContent = "Ref " + ref;
    if (viaEmail) $("successMsg").textContent = "Your email app should have opened with your booking details. Hit send there to reach us. We'll confirm availability and your final quote shortly.";
    $("submitBtn").style.display = "none";
    $("quoteSub").textContent = "Reference " + ref;
    try { localStorage.removeItem(DRAFT_KEY); } catch(e){}
    window.scrollTo({top:0, behavior:"smooth"});
  }

  form.addEventListener("submit", function(e){
    e.preventDefault();
    if (form.elements._gotcha.value) return; // bot
    if (!validate()) return;
    var v = values(), q = render(), ref = refNumber(), body = summary(v, q, ref);
    var btn = $("submitBtn");

    if (!C.formEndpoint){
      var subject = "Booking request " + ref + ": " + (C.eventTypes[v.type].label) + " on " + v.date;
      location.href = "mailto:" + C.brand.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      showSuccess(ref, true);
      return;
    }

    btn.disabled = true; btn.textContent = "Sending...";
    var payload = Object.assign({}, v, {
      reference: ref,
      addOns: v.addOns.map(function(k){ return C.addOns[k].label; }).join(", "),
      eventType: C.eventTypes[v.type].label,
      estimateTotal: fmt.format(q.total) + (q.custom ? " + travel" : ""),
      estimateDeposit: fmt.format(q.deposit),
      summary: body,
      _subject: "Booking request " + ref,
      _replyto: v.email
    });
    fetch(C.formEndpoint, { method:"POST", headers:{ "Content-Type":"application/json", "Accept":"application/json" }, body: JSON.stringify(payload) })
      .then(function(r){ if (!r.ok) throw new Error(r.status); showSuccess(ref, false); })
      .catch(function(){
        btn.disabled = false; btn.textContent = "Send booking request";
        alert("Something went wrong sending your request. Please try again, or email us at " + C.brand.email);
      });
  });

  form.addEventListener("input", render);
  form.addEventListener("change", function(e){
    if (e.target.closest(".field")) setErr(e.target, false);
    if (e.target.name === "type") et.closest(".field").classList.remove("has-err");
    render();
  });

  loadDraft();
  render();
})();
