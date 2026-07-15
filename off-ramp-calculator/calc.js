// GLP-1 off-ramp / weight-regain-risk calculator. External file (site CSP is
// script-src 'self'). Anchor figure is trial-measured: the STEP 1 extension
// (Wilding 2022) found ~two-thirds of lost weight regained within 12 months of
// stopping semaglutide (mean net loss 17.3% -> 5.6%). The plan and muscle
// modifiers below are ILLUSTRATIVE projections from that anchor plus the
// principle that a gradual taper, continued treatment, and preserved muscle
// blunt regain; they are not separately trial-measured. Chart is inline SVG.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $("calc"); if (!form) return;
  var COLD_BASE = 0.67;                       // STEP 1 extension: ~two-thirds in 12 mo
  var PLAN = { cold: 0.67, taper: 0.55, stay: 0.12 };
  var MUSCLE = { yes: 0.8, no: 1.0 };         // preserved muscle blunts regain (illustrative)
  var TAU = 4;                                // months; regain is front-loaded

  function num(id) { var v = parseFloat($(id).value); return isFinite(v) ? v : NaN; }
  function fmt(n) { return Math.round(n).toLocaleString(); }
  function regainByMonth(total, t) { return total * (1 - Math.exp(-t / TAU)); }

  function compute() {
    var cur = num("weight"), lost = num("lost");
    var unit = $("weightUnit").value;
    var plan = $("plan").value, muscle = $("muscle").value;
    if (!(cur > 0 && lost > 0)) { $("out").hidden = true; return; }

    var frac = Math.max(0.05, Math.min(0.9, PLAN[plan] * MUSCLE[muscle]));
    var totalRegain = lost * frac;            // asymptotic 12-month regain
    var coldRegain = lost * COLD_BASE;        // reference: cold stop, no plan
    var wt12 = cur + regainByMonth(totalRegain, 12);

    $("regain").textContent = "+" + fmt(totalRegain) + " " + unit;
    $("wt12").textContent = fmt(wt12) + " " + unit;
    $("kept").textContent = Math.round((1 - frac) * 100) + "%";
    $("cold").textContent = "+" + fmt(coldRegain) + " " + unit;

    var note = $("planNote");
    if (plan === "stay") {
      note.textContent = "Staying on a maintenance dose keeps most of your loss while treatment continues. This assumes the medication keeps working; it is not a taper.";
    } else if (muscle === "yes") {
      note.textContent = "Because the plan and muscle effects are modeled, treat the green line as a direction, not a guarantee. The one figure that is trial-measured is the red line: about two-thirds regained after a cold stop.";
    } else {
      note.textContent = "Adding resistance training and adequate protein before you come off is the biggest lever you still control. Switch the muscle option to see the difference.";
    }
    note.hidden = false;

    drawChart(cur, totalRegain, coldRegain, unit);
    $("out").hidden = false;
  }

  function drawChart(cur, totalRegain, coldRegain, unit) {
    var W = 640, H = 340, m = { t: 16, r: 14, b: 40, l: 54 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var minW = cur, maxW = cur + Math.max(coldRegain, totalRegain, 1);
    var span = maxW - minW; if (span <= 0) { $("chart").innerHTML = ""; return; }
    var xs = function (mo) { return m.l + (mo / 12) * iw; };
    var ys = function (v) { return m.t + ih - ((v - minW) / span) * ih; };

    var plan = [], cold = [], mo;
    for (mo = 0; mo <= 12; mo++) {
      plan.push([xs(mo), ys(cur + regainByMonth(totalRegain, mo))]);
      cold.push([xs(mo), ys(cur + regainByMonth(coldRegain, mo))]);
    }
    function d(pts) { return pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" "); }

    var grid = "", i, val, y;
    for (i = 0; i <= 4; i++) {
      val = minW + span * i / 4; y = ys(val);
      grid += '<line x1="' + m.l + '" y1="' + y.toFixed(1) + '" x2="' + (W - m.r) + '" y2="' + y.toFixed(1) + '" stroke="#e5e7eb" stroke-width="1"/>';
      grid += '<text x="' + (m.l - 6) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#6b7280">' + val.toFixed(0) + '</text>';
    }
    var xl = "";
    [0, 3, 6, 9, 12].forEach(function (mm) {
      xl += '<text x="' + xs(mm).toFixed(1) + '" y="' + (H - m.b + 18) + '" text-anchor="middle" font-size="11" fill="#6b7280">mo ' + mm + '</text>';
    });

    $("chart").innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" ' +
      'aria-label="Projected weight over 12 months after stopping: your plan versus a cold stop with no muscle plan">' +
      grid +
      '<path d="' + d(cold) + '" fill="none" stroke="#c0392b" stroke-width="2.5"/>' +
      '<path d="' + d(plan) + '" fill="none" stroke="#2f6f5e" stroke-width="2.5"/>' +
      '<text x="' + m.l + '" y="10" font-size="10.5" fill="#6b7280">' + unit + '</text>' +
      xl + '</svg>';
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); compute(); });
})();
