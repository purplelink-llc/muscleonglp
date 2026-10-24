// GLP-1 split dose calculator. External file (site CSP is script-src 'self').
// Pure arithmetic: weekly dose (mg) / number of injections, spread over the week.
// It recommends no dose and no schedule, converts no units (no mg to mL or syringe
// units: for a compounded vial that conversion depends on the printed concentration
// and an error there is the dangerous one), and knows nothing about the device.
// Label facts shown beside the result come from the manufacturers' prescribing
// information (Ozempic section 2.1, Zepbound section 2.3), cited on the page.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $("calc"); if (!form) return;

  var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  // Largest labeled once-weekly dose: Wegovy 7.2 mg (semaglutide), Zepbound/Mounjaro 15 mg.
  // Used only to catch a typo (25 for 2.5), never to suggest a dose.
  var LABEL_MAX = { sema: 7.2, tirz: 15 };
  var LABEL_NOTE = {
    sema: "Ozempic label, section 2.1: administer once weekly, on the same day each week, at any time of day. Elimination half-life is approximately 1 week.",
    tirz: "Zepbound label: once weekly, at any time of day. A missed dose is taken within 4 days (96 hours), otherwise skipped (section 2.3). Half-life is approximately 5 to 6 days."
  };

  function num(id) { var v = parseFloat($(id).value); return isFinite(v) ? v : NaN; }
  function fmt(x) { return String(Math.round(x * 1000) / 1000); }

  // Evenly spread injection days: day offset floor(i * 7 / n) from the start day.
  function offsets(n) {
    var o = [], i;
    for (i = 0; i < n; i++) { o.push(Math.floor(i * 7 / n)); }
    return o;
  }
  function gaps(o) {
    var g = [], i, n = o.length;
    for (i = 0; i < n; i++) {
      g.push(i + 1 < n ? o[i + 1] - o[i] : 7 - o[i] + o[0]);
    }
    return g;
  }

  var errBox = $("calcError"), liveBox = $("liveSummary"), liveTimer = null;
  function showError(msg) { errBox.textContent = msg; errBox.hidden = false; $("weekly").setAttribute("aria-invalid", "true"); }
  function clearError() { errBox.hidden = true; errBox.textContent = ""; $("weekly").removeAttribute("aria-invalid"); }
  function announce(text) { clearTimeout(liveTimer); liveTimer = setTimeout(function () { liveBox.textContent = text; }, 500); }

  function compute() {
    var weekly = num("weekly"), n = parseInt($("count").value, 10);
    var start = parseInt($("start").value, 10), med = $("med").value;
    if (!(weekly > 0) || !(n >= 2)) {
      $("out").hidden = true;
      var m1 = "Enter the weekly dose in milligrams, a number above 0.";
      showError(m1); announce(m1); return;
    }

    var per = weekly / n;
    var shown = parseFloat(fmt(per));
    if (!(shown > 0)) {                                   // too small to show at three decimals
      $("out").hidden = true;
      var m2 = "That dose is too small to divide and show at three decimals of a milligram. Check the number.";
      showError(m2); announce(m2); return;
    }
    clearError();
    var o = offsets(n), g = gaps(o), body = $("rows"), i, tr, td;

    $("perDose").textContent = fmt(per) + " mg";
    $("perDoseLabel").textContent = "per injection, " + n + " times a week (" + fmt(weekly) + " mg a week in total)";

    while (body.firstChild) { body.removeChild(body.firstChild); }
    for (i = 0; i < n; i++) {
      tr = document.createElement("tr");
      td = document.createElement("td"); td.textContent = DAYS[(start + o[i]) % 7]; tr.appendChild(td);
      td = document.createElement("td"); td.textContent = fmt(per) + "\u00a0mg"; tr.appendChild(td);
      td = document.createElement("td"); td.textContent = g[i] + (g[i] === 1 ? " day" : " days") + " until the next"; tr.appendChild(td);
      body.appendChild(tr);
    }

    var sum = shown * n, drift = Math.abs(sum - weekly) > 0.0005;
    $("totalCheck").textContent = drift
      ? "Rounded to three decimals, " + n + " x " + fmt(per) + " mg is " + fmt(sum) + " mg, not exactly " + fmt(weekly) + " mg. Ask your pharmacist how your device rounds a dose like this."
      : n + " x " + fmt(per) + " mg = " + fmt(weekly) + " mg, the same weekly total.";

    var over = weekly > LABEL_MAX[med];
    $("maxWarn").hidden = !over;
    if (over) {
      $("maxWarn").textContent = "Check the number. " + fmt(weekly) + " mg a week is above the largest labeled once-weekly dose for " +
        (med === "tirz" ? "tirzepatide" : "semaglutide") + " (" + fmt(LABEL_MAX[med]) +
        " mg). This calculator works in milligrams, not syringe units or milliliters.";
    }

    $("labelNote").textContent = LABEL_NOTE[med] + (med === "tirz" ? " Single-dose Zepbound pens and vials hold one labeled dose and cannot be divided; only the multi-dose vial and KwikPen hold four." : "");
    $("out").hidden = false;
    announce(fmt(per) + " mg per injection, " + n + " times a week, " + fmt(weekly) + " mg a week in total. " + (over ? $("maxWarn").textContent : "") + " This is arithmetic only, not a recommended schedule; confirm with your prescriber or pharmacist.");
  }

  var SEED = { weekly: "1", count: "2", start: "0", med: "sema" };
  var touched = false;
  function markTouched() {
    if (touched) return;
    touched = true;
    var n = $("exampleNote"); if (n) { n.hidden = true; }
    var c = $("exampleCaption"); if (c) { c.hidden = true; }
    // Once, on the first deliberate edit. Not on load: the seeded render would
    // make calc_use a synonym for pageviews.
    if (window.mogTrack) window.mogTrack("calc_use", "split-dose");
  }

  Object.keys(SEED).forEach(function (id) { var el = $(id); if (el && !el.value) { el.value = SEED[id]; } });
  compute();
  clearTimeout(liveTimer);   // no announcement for the seeded example
  form.addEventListener("focusin", function (e) {
    var t = e.target;
    if (t && t.tagName === "INPUT" && t.type === "number") { try { t.select(); } catch (err) { /* ignore */ } }
  });
  form.addEventListener("input", function () { markTouched(); compute(); });
  form.addEventListener("change", function () { markTouched(); compute(); });
  form.addEventListener("submit", function (e) { e.preventDefault(); compute(); });
})();
