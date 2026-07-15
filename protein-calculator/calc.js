// GLP-1 muscle & weight-loss calculator. External file (site CSP is
// script-src 'self'). Equations: BMR = Mifflin-St Jeor (1990); TDEE = BMR x PAL;
// pace->deficit via ~7700 kcal/kg (Wishnofsky 1958, a linear approximation);
// protein 1.6-2.2 g/kg (Morton 2018); muscle split modeled from Neeland 2024
// (15-40% lean) and Sardeli 2018 (resistance training offsets ~93.5% of lean loss).
// The chart is drawn as inline SVG (no third-party library).
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $("calc"); if (!form) return;
  var LB = 0.453592, INCH = 2.54, KCAL_PER_KG = 7700;
  var LEAN_NOPLAN = 0.30;                 // lean fraction of loss without countermeasures
  var LEAN_PLAN = 0.30 * (1 - 0.935);     // resistance training offsets ~93.5% -> ~0.02

  function num(id) { var v = parseFloat($(id).value); return isFinite(v) ? v : NaN; }
  function fmt(n) { return Math.round(n).toLocaleString(); }

  function compute() {
    var age = num("age"), h = num("height"), w = num("weight"), g = num("goal");
    var sex = $("sex").value, hu = $("heightUnit").value, wu = $("weightUnit").value;
    var pal = parseFloat($("activity").value), pace = parseFloat($("pace").value); // kg/week
    if (!(age > 0 && h > 0 && w > 0)) { $("out").hidden = true; return; }

    var kg = wu === "kg" ? w : w * LB;
    var cm = hu === "cm" ? h : h * INCH;
    var goalKg = g > 0 ? (wu === "kg" ? g : g * LB) : NaN;

    var bmr = sex === "male"
      ? (10 * kg + 6.25 * cm - 5 * age + 5)
      : (10 * kg + 6.25 * cm - 5 * age - 161);
    var tdee = bmr * pal;
    var deficit = pace * KCAL_PER_KG / 7;
    var target = tdee - deficit;
    var pLow = Math.round(kg * 1.6), pHigh = Math.round(kg * 2.2);

    $("bmr").textContent = fmt(bmr) + " kcal";
    $("tdee").textContent = fmt(tdee) + " kcal";
    $("target").textContent = fmt(target) + " kcal";
    $("deficit").textContent = "−" + fmt(deficit) + " kcal";
    $("protein").textContent = pLow + "–" + pHigh + " g";
    $("permeal").textContent = Math.round(pLow / 4) + "–" + Math.round(pHigh / 4) + " g";

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
  }

  function drawChart(weeks, totalKg, pace, wu) {
    var conv = wu === "kg" ? 1 : 1 / LB, unit = wu === "kg" ? "kg" : "lb";
    var W = 640, H = 340, m = { t: 16, r: 14, b: 40, l: 46 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var maxLost = totalKg * conv;
    if (!(maxLost > 0)) { $("chart").innerHTML = ""; return; }
    var xs = function (wk) { return m.l + (wk / weeks) * iw; };
    var ys = function (v) { return m.t + ih - (v / maxLost) * ih; };

    var total = [], noPlan = [], plan = [], wk, lost;
    for (wk = 0; wk <= weeks; wk++) {
      lost = Math.min(wk * pace, totalKg) * conv;
      total.push([xs(wk), ys(lost)]);
      noPlan.push([xs(wk), ys(lost * LEAN_NOPLAN)]);
      plan.push([xs(wk), ys(lost * LEAN_PLAN)]);
    }
    function d(pts) {
      return pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    }

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
      'aria-label="Projected total weight lost and muscle lost over time, with and without adequate protein and training">' +
      grid +
      '<path d="' + d(total) + '" fill="none" stroke="#9ca3af" stroke-width="2" stroke-dasharray="5 4"/>' +
      '<path d="' + d(noPlan) + '" fill="none" stroke="#c0392b" stroke-width="2.5"/>' +
      '<path d="' + d(plan) + '" fill="none" stroke="#2f6f5e" stroke-width="2.5"/>' +
      '<text x="' + m.l + '" y="10" font-size="10.5" fill="#6b7280">' + unit + ' lost</text>' +
      xl +
      '</svg>';
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); compute(); });
})();
