// GLP-1 muscle-loss risk estimator. External file (site CSP is script-src 'self').
// Model: baseline lean-mass share of GLP-1 weight loss = ~0.33 (semaglutide / other)
// or ~0.26 (tirzepatide, SURMOUNT-1 DXA substudy), within the 15-40% review range
// (Neeland 2024). Countermeasures shift the estimate toward the low end using the
// finding that resistance training offset ~93.5% of diet-induced lean-mass loss
// (Sardeli 2018); protein target 1.6 g/kg (Morton 2018). Every number is traceable
// to a cited source. Output is an illustrative projection, not a measurement.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $("calc"); if (!form) return;
  var LB = 0.453592;
  var HIGH_END = 0.40;   // Neeland 2024 upper bound of the lean-mass share range
  var OFFSET = 0.935;    // Sardeli 2018: resistance training offset of lean-mass loss

  function num(id) { var v = parseFloat($(id).value); return isFinite(v) ? v : NaN; }
  function pct(x) { return Math.round(x * 100) + "%"; }

  function compute() {
    var age = num("age"), w = num("weight"), g = num("goal");
    var wu = $("weightUnit").value, med = $("med").value;
    var protein = $("protein").value, training = $("training").value;
    if (!(age > 0 && w > 0)) { $("out").hidden = true; return; }

    var kg = wu === "kg" ? w : w * LB;
    var goalKg = g > 0 ? (wu === "kg" ? g : g * LB) : NaN;

    // Baseline (center) lean-mass share for the chosen medication.
    var baseline = med === "tirz" ? 0.26 : 0.33;

    // Scenario anchors.
    // Best case (full countermeasures): resistance training offsets ~93.5% of the
    // lean loss, applied to the baseline share.
    var withFrac = baseline * (1 - OFFSET);
    // Worst case (no countermeasures): the upper end of the published range.
    var withoutFrac = HIGH_END;

    // Effectiveness of the user's current habits, 0 (none) to 1 (full protocol).
    // Training is the primary driver; protein enables it (Morton 2018).
    var pFactor = protein === "high" ? 1 : protein === "mid" ? 0.5 : 0;
    var tFactor = training === "full" ? 1 : training === "some" ? 0.5 : 0;
    var E = OFFSET * (0.65 * tFactor + 0.35 * pFactor);

    // Interpolate the user's estimate between the two scenarios.
    var youFrac = withoutFrac - E * (withoutFrac - withFrac);

    $("youFrac").textContent = pct(youFrac);
    $("withoutFrac").textContent = pct(withoutFrac);
    $("withFrac").textContent = pct(withFrac);

    if (goalKg > 0 && goalKg < kg) {
      var lossKg = kg - goalKg;
      var unit = wu === "kg" ? "kg" : "lb";
      var conv = wu === "kg" ? 1 : 1 / LB;
      var show = function (fracKg) { return (fracKg * conv).toFixed(1) + " " + unit; };
      $("totalLoss").textContent = (lossKg * conv).toFixed(0) + " " + unit;
      $("withoutKg").textContent = show(lossKg * withoutFrac);
      $("youKg").textContent = show(lossKg * youFrac);
      $("withKg").textContent = show(lossKg * withFrac);
      $("goalWrap").hidden = false;
    } else {
      $("goalWrap").hidden = true;
    }

    $("out").hidden = false;
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); compute(); });
})();
