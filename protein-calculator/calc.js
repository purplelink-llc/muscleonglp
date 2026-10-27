// GLP-1 muscle & weight-loss calculator. External file (site CSP is
// script-src 'self'). Equations: BMR = Mifflin-St Jeor (1990); TDEE = BMR x PAL;
// pace->deficit via ~7700 kcal/kg (Wishnofsky 1958, a linear approximation);
// protein 1.6-2.2 g/kg (Morton 2018), with the 1.2-1.6 g/kg GLP-1 advisory range
// shown beside it; muscle split from the shared model in /glp1-model.js (Neeland
// 2024 range, Sardeli 2018 offset), the same numbers the muscle-loss calculator uses.
// The chart is drawn as inline SVG (no third-party library).
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $("calc"); if (!form) return;
  var LB = 0.453592, INCH = 2.54, KCAL_PER_KG = 7700;
  var M = window.MOG_MODEL; if (!M) return;
  var LEAN_NOPLAN = M.noPlan("other");    // lean fraction of loss without countermeasures (40%)
  var PLAN = M.plan("other");             // best case with countermeasures: [~2%, 15%]
  var LEAN_PLAN_LOW = PLAN[0], LEAN_PLAN_HIGH = PLAN[1];
  var P_LOW = 1.6, P_HIGH = 2.2, ADV_LOW = 1.2, ADV_HIGH = 1.6;   // g/kg
  var errBox = $("calcError"), liveBox = $("liveSummary"), liveTimer = null;
  var FIELDS = ["age", "height", "weight", "goal"];

  function num(id) { var v = parseFloat($(id).value); return isFinite(v) ? v : NaN; }
  function fmt(n) { return Math.round(n).toLocaleString(); }
  function showError(msg, ids) {
    errBox.textContent = msg; errBox.hidden = false;
    FIELDS.forEach(function (id) { if (ids.indexOf(id) >= 0) { $(id).setAttribute("aria-invalid", "true"); } else { $(id).removeAttribute("aria-invalid"); } });
  }
  function clearError() {
    errBox.hidden = true; errBox.textContent = "";
    FIELDS.forEach(function (id) { $(id).removeAttribute("aria-invalid"); });
  }
  function announce(text) {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () { liveBox.textContent = text; }, 500);
  }
  function setUnitLimits() {
    var kgU = $("weightUnit").value === "kg", cmU = $("heightUnit").value === "cm";
    ["weight", "goal"].forEach(function (id) { $(id).max = kgU ? "400" : "880"; });
    $("height").min = cmU ? "90" : "36"; $("height").max = cmU ? "245" : "96";
  }

  function compute() {
    var age = num("age"), h = num("height"), w = num("weight"), g = num("goal");
    var sex = $("sex").value, hu = $("heightUnit").value, wu = $("weightUnit").value;
    var pal = parseFloat($("activity").value), pace = parseFloat($("pace").value); // kg/week
    var meals = parseInt(($("meals") && $("meals").value) || "4", 10);
    if (!(meals >= 3 && meals <= 5)) { meals = 4; }
    var kgU = wu === "kg", cmU = hu === "cm";
    var hMin = cmU ? 90 : 36, hMax = cmU ? 245 : 96, wMax = kgU ? 400 : 880;
    var bad = "", ids = [];
    if (!(age >= 18)) { bad = "This calculator is for adults. Enter an age of 18 or older."; ids = ["age"]; }
    else if (age > 100) { bad = "Enter an age of 100 or less."; ids = ["age"]; }
    else if (!(h >= hMin && h <= hMax)) { bad = "Enter your height between " + hMin + " and " + hMax + " " + hu + "."; ids = ["height"]; }
    else if (!(w > 0 && w <= wMax)) { bad = "Enter your current weight above 0 and no more than " + wMax + " " + wu + "."; ids = ["weight"]; }
    if (bad) {
      $("out").hidden = true;
      showError(bad, ids);
      announce(bad);
      return;
    }
    if (!isNaN(g) && (g <= 0 || g >= w)) {
      showError(g <= 0 ? "Goal weight must be above 0, or leave it blank." : "Goal weight must be below your current weight. The time-to-goal and chart are hidden until it is.", ["goal"]);
    } else { clearError(); }

    var kg = wu === "kg" ? w : w * LB;
    var cm = hu === "cm" ? h : h * INCH;
    var goalKg = g > 0 ? (wu === "kg" ? g : g * LB) : NaN;

    var bmr = sex === "male"
      ? (10 * kg + 6.25 * cm - 5 * age + 5)
      : (10 * kg + 6.25 * cm - 5 * age - 161);
    var tdee = bmr * pal;
    var deficit = pace * KCAL_PER_KG / 7;
    var target = tdee - deficit;
    var pLow = Math.round(kg * P_LOW), pHigh = Math.round(kg * P_HIGH);
    var aLow = Math.round(kg * ADV_LOW), aHigh = Math.round(kg * ADV_HIGH);

    $("bmr").textContent = fmt(bmr) + " kcal";
    $("tdee").textContent = fmt(tdee) + " kcal";
    $("target").textContent = fmt(target) + " kcal";
    $("deficit").textContent = "−" + fmt(deficit) + " kcal";
    $("protein").textContent = pLow + "–" + pHigh + " g";
    $("advRange").textContent = aLow + " to " + aHigh + " g a day (" + ADV_LOW + " to " + ADV_HIGH + " g/kg)";
    $("permeal").textContent = Math.round(pLow / meals) + "–" + Math.round(pHigh / meals) + " g";
    var permealLabel = $("permealLabel");
    if (permealLabel) { permealLabel.textContent = "Protein / meal (×" + meals + ")"; }
    drawPlan(meals, pLow, pHigh);
    drawMacros(target, pLow);

    if (goalKg > 0 && goalKg < kg) {
      var totalKg = kg - goalKg;
      var weeks = Math.max(1, Math.ceil(totalKg / pace));
      $("weeks").textContent = weeks + (weeks === 1 ? " week" : " weeks");
      $("weeksRow").hidden = false;
      drawChart(weeks, totalKg, pace, wu);
      $("chartWrap").hidden = false;
    } else {
      $("weeksRow").hidden = true;
      $("chartWrap").hidden = true;
    }

    var floor = sex === "female" ? 1200 : 1500;
    var s = $("safety");
    if (target < floor) {
      s.hidden = false;
      s.textContent = "Heads-up: this target (" + fmt(target) + " kcal) is below the " + floor +
        " kcal general floor for " + (sex === "female" ? "women" : "men") +
        ". A gentler pace, or a clinician-guided plan, is safer, especially on a GLP-1.";
    } else { s.hidden = true; }

    $("out").hidden = false;
    announce("Calorie target " + fmt(target) + " kcal a day, " + fmt(deficit) + " below maintenance. Protein " + pLow + " to " + pHigh +
      " g a day, " + $("permeal").textContent.replace("–", " to ") + " per meal." +
      (!s.hidden ? " " + s.textContent : ""));
  }

  // Macros at the calorie target. Protein at the low end of the training range
  // (1.6 g/kg), fat at 25% of calories (inside the 20-35% adult AMDR), carbs
  // the remainder, fiber at 14 g per 1,000 kcal (Dietary Guidelines for
  // Americans). Shown only when it adds up: a target too small to hold the
  // protein plus a minimum of fat hides the row rather than print a negative.
  var FAT_SHARE = 0.25, FIBER_PER_KCAL = 14 / 1000;
  function drawMacros(target, proteinG) {
    var row = $("macroRow"); if (!row) { return; }
    var fatG = target * FAT_SHARE / 9;
    var carbG = (target - proteinG * 4 - fatG * 9) / 4;
    if (!(target > 0) || carbG < 0) { row.hidden = true; return; }
    $("mProtein").textContent = fmt(proteinG) + " g";
    $("mFat").textContent = fmt(fatG) + " g";
    $("mCarb").textContent = fmt(carbG) + " g";
    $("mFiber").textContent = fmt(target * FIBER_PER_KCAL) + " g";
    $("mProteinPct").textContent = Math.round(proteinG * 4 / target * 100) + "% of calories";
    $("mCarbPct").textContent = Math.round(carbG * 4 / target * 100) + "% of calories";
    row.hidden = false;
  }

  // Timed meal schedule. Even split of the daily protein range across the
  // chosen number of meals, spread over a 12-hour window (8am to 8pm).
  var SCHEDULES = {
    3: [["Breakfast", "8:00 am"], ["Lunch", "1:00 pm"], ["Dinner", "6:00 pm"]],
    4: [["Breakfast", "8:00 am"], ["Lunch", "12:00 pm"], ["Snack", "4:00 pm"], ["Dinner", "8:00 pm"]],
    5: [["Breakfast", "8:00 am"], ["Mid-morning", "11:00 am"], ["Lunch", "2:00 pm"], ["Snack", "5:00 pm"], ["Dinner", "8:00 pm"]]
  };

  function drawPlan(meals, pLow, pHigh) {
    var wrap = $("planWrap"), rows = $("planRows");
    if (!wrap || !rows) { return; }
    var sched = SCHEDULES[meals] || SCHEDULES[4];
    var low = Math.round(pLow / meals), high = Math.round(pHigh / meals);
    var html = "";
    for (var i = 0; i < sched.length; i++) {
      html += '<tr>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #dde7e3">' + sched[i][0] + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #dde7e3;color:#45524c">' + sched[i][1] + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #dde7e3;text-align:right;font-weight:650">' + low + '–' + high + ' g</td>' +
        '</tr>';
    }
    rows.innerHTML = html;
    wrap.hidden = false;
  }

  function drawChart(weeks, totalKg, pace, wu) {
    var conv = wu === "kg" ? 1 : 1 / LB, unit = wu === "kg" ? "kg" : "lb";
    var W = 640, H = 340, m = { t: 16, r: 74, b: 40, l: 46 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var maxLost = totalKg * conv;
    if (!(maxLost > 0)) { $("chart").innerHTML = ""; return; }
    var xs = function (wk) { return m.l + (wk / weeks) * iw; };
    var ys = function (v) { return m.t + ih - (v / maxLost) * ih; };

    var total = [], noPlan = [], plan = [], planLo = [], wk, lost;
    for (wk = 0; wk <= weeks; wk++) {
      lost = Math.min(wk * pace, totalKg) * conv;
      total.push([xs(wk), ys(lost)]);
      noPlan.push([xs(wk), ys(lost * LEAN_NOPLAN)]);
      plan.push([xs(wk), ys(lost * LEAN_PLAN_HIGH)]);
      planLo.push([xs(wk), ys(lost * LEAN_PLAN_LOW)]);
    }
    function d(pts) {
      return pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    }

    var band = plan.concat(planLo.slice().reverse());
    var endLabel = function (pts, text, fill, dy) {
      var p = pts[pts.length - 1];
      return '<text x="' + (p[0] + 6).toFixed(1) + '" y="' + (p[1] + 4 + (dy || 0)).toFixed(1) + '" font-size="11" font-weight="600" fill="' + fill + '">' + text + '</text>';
    };
    var lastLost = Math.min(weeks * pace, totalKg) * conv;
    var summary = "Of " + lastLost.toFixed(0) + " " + unit + " lost over " + weeks + " weeks, lean mass lost is about " +
      (lastLost * LEAN_NOPLAN).toFixed(1) + " " + unit + " without enough protein and training, and about " +
      (lastLost * LEAN_PLAN_LOW).toFixed(1) + " to " + (lastLost * LEAN_PLAN_HIGH).toFixed(1) + " " + unit +
      " with both. The best case is extrapolated from trials that were not in GLP-1 users.";
    if ($("chartSummary")) { $("chartSummary").textContent = summary; }

    var grid = "", i, val, y;
    for (i = 0; i <= 4; i++) {
      val = maxLost * i / 4; y = ys(val);
      grid += '<line x1="' + m.l + '" y1="' + y.toFixed(1) + '" x2="' + (W - m.r) + '" y2="' + y.toFixed(1) + '" stroke="#e5e7eb" stroke-width="1"/>';
      grid += '<text x="' + (m.l - 6) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#6b7280">' + val.toFixed(0) + '</text>';
    }
    var xl = "";
    [0, Math.round(weeks / 2), weeks].forEach(function (w2) {
      xl += '<text x="' + xs(w2).toFixed(1) + '" y="' + (H - m.b + 18) + '" text-anchor="middle" font-size="11" fill="#6b7280">wk ' + w2 + '</text>';
    });

    $("chart").innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" ' +
      'aria-label="Projected total weight lost and lean mass lost over time, with and without adequate protein and training. A text summary follows the chart.">' +
      grid +
      '<path d="' + d(total) + '" fill="none" stroke="#9ca3af" stroke-width="2" stroke-dasharray="5 4"/>' +
      '<path d="M' + band.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L") + ' Z" fill="#2f6f5e" fill-opacity="0.18" stroke="none"/>' +
      '<path d="' + d(noPlan) + '" fill="none" stroke="#c0392b" stroke-width="2.5" stroke-dasharray="9 3 2 3"/>' +
      '<path d="' + d(plan) + '" fill="none" stroke="#2f6f5e" stroke-width="2.5"/>' +
      endLabel(total, "Total", "#4b5563", 0) + endLabel(noPlan, "No plan", "#a02f23", 0) + endLabel(plan, "With plan", "#245546", 0) +
      '<text x="' + m.l + '" y="10" font-size="10.5" fill="#6b7280">' + unit + ' lost</text>' +
      xl +
      '</svg>';
  }

  // ── live calculation ──────────────────────────────────────────────────────
  // This used to be submit-gated: nothing appeared until you filled every field
  // and pressed the button. Over the week to 2026-08-18 that converted 1 of 40
  // visits, against 60 to 79 percent on the Purplelink tools measured by the
  // same beacon. The tool was not broken; it asked for four answers on faith
  // before showing anything, and most arrivals come from a Reddit link rather
  // than a search with intent behind it. So it now computes as you type.
  //
  // The fields are seeded with the values that were already the placeholders,
  // so a result is on screen immediately. That result describes an example
  // person, not the visitor, and saying so is not optional on a health tool:
  // EXAMPLE_NOTE stays visible until the first edit, then goes away for good.
  var SEED = {
      sex: 'female',
      age: '45',
      height: '66',
      heightUnit: 'in',
      weight: '210',
      weightUnit: 'lb',
      goal: '170',
      activity: '1.375',
      pace: '0.45',
      meals: '4'
  };
  var touched = false;

  function seed() {
    Object.keys(SEED).forEach(function (id) {
      var el = $(id);
      if (el && !el.value) { el.value = SEED[id]; }
    });
  }

  function markTouched() {
    if (touched) return;
    touched = true;
    ["exampleNote", "exampleCaption"].forEach(function (id) { var n = $(id); if (n) { n.hidden = true; } });
    // Fires once, on the first deliberate edit. Not on load: counting the seeded
    // render would make calc_use a synonym for pageviews and destroy the metric.
    if (window.mogTrack) window.mogTrack("calc_use", "protein");
  }

  var prevW = $("weightUnit").value, prevH = $("heightUnit").value;
  function convertOnUnitChange(id) {
    var wNow = $("weightUnit").value, hNow = $("heightUnit").value;
    if (id === "weightUnit" && wNow !== prevW) {
      ["weight", "goal"].forEach(function (f) {
        var v = num(f);
        if (v > 0) { $(f).value = String(Math.round((wNow === "kg" ? v * LB : v / LB) * 10) / 10); }
      });
      prevW = wNow;
    }
    if (id === "heightUnit" && hNow !== prevH) {
      var hv = num("height");
      if (hv > 0) { $("height").value = String(Math.round((hNow === "cm" ? hv * INCH : hv / INCH) * 10) / 10); }
      prevH = hNow;
    }
    setUnitLimits();
  }

  seed();
  setUnitLimits();
  prevW = $("weightUnit").value; prevH = $("heightUnit").value;
  compute();
  clearTimeout(liveTimer);   // no announcement for the seeded example

  form.addEventListener("input", function () { markTouched(); compute(); });
  form.addEventListener("change", function (e) {
    if (e.target && (e.target.id === "weightUnit" || e.target.id === "heightUnit")) { convertOnUnitChange(e.target.id); }
    markTouched(); compute();
  });
  // Typing replaces the example instead of appending to it.
  form.addEventListener("focusin", function (e) {
    var t = e.target;
    if (t && t.tagName === "INPUT" && t.type === "number") { try { t.select(); } catch (err) { /* ignore */ } }
  });

  // The button is gone, but Enter in a text field still submits a form.
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    markTouched();
    compute();
  });
})();
