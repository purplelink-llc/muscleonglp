// GLP-1 muscle-loss risk estimator. External file (site CSP is script-src 'self').
// The numbers live in /glp1-model.js (shared with the calorie and protein
// calculator) and are explained there. Output is an illustrative projection from
// published ranges, not a measurement.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $("calc"); if (!form) return;
  var M = window.MOG_MODEL; if (!M) return;
  var LB = 0.453592;

  function num(id) { var v = parseFloat($(id).value); return isFinite(v) ? v : NaN; }
  function pct(x) { return Math.round(x * 100); }
  // "8 to 22%" or "40%" when both ends round to the same figure.
  function pctRange(a, b) {
    var lo = Math.min(pct(a), pct(b)), hi = Math.max(pct(a), pct(b));
    return lo === hi ? lo + "%" : lo + " to " + hi + "%";
  }

  var errBox = $("calcError"), liveBox = $("liveSummary"), liveTimer = null;

  function setInvalid(ids) {
    ["weight", "goal"].forEach(function (id) {
      var el = $(id);
      if (ids.indexOf(id) >= 0) { el.setAttribute("aria-invalid", "true"); }
      else { el.removeAttribute("aria-invalid"); }
    });
  }
  function showError(msg, ids) {
    errBox.textContent = msg; errBox.hidden = false; setInvalid(ids);
  }
  function clearError() { errBox.hidden = true; errBox.textContent = ""; setInvalid([]); }

  // Announce a short summary, not the whole table, and not on every keystroke.
  function announce(text) {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () { liveBox.textContent = text; }, 500);
  }

  function setUnitLimits() {
    var kgUnit = $("weightUnit").value === "kg";
    ["weight", "goal"].forEach(function (id) { $(id).max = kgUnit ? "400" : "880"; });
  }

  function compute() {
    var w = num("weight"), g = num("goal");
    var wu = $("weightUnit").value, med = $("med").value;
    var protein = $("protein").value, training = $("training").value;
    var maxW = wu === "kg" ? 400 : 880;

    if (!(w > 0)) {
      $("out").hidden = true;
      showError("Enter your current weight as a number above 0.", ["weight"]);
      announce("Enter your current weight to see a result.");
      return;
    }
    if (w > maxW) {
      $("out").hidden = true;
      showError("Weight must be " + maxW + " " + wu + " or less.", ["weight"]);
      announce("Weight is out of range.");
      return;
    }
    var goalMsg = "", goalIds = [];
    if (!isNaN(g) && g <= 0) { goalMsg = "Goal weight must be above 0, or leave it blank."; goalIds = ["goal"]; }
    else if (g > 0 && g >= w) { goalMsg = "Goal weight must be below your current weight. The lean-mass-at-risk numbers are hidden until it is."; goalIds = ["goal"]; }
    if (goalMsg) { showError(goalMsg, goalIds); } else { clearError(); }

    var kg = wu === "kg" ? w : w * LB;
    var goalKg = g > 0 ? (wu === "kg" ? g : g * LB) : NaN;

    var withoutFrac = M.noPlan(med);
    var planRange = M.plan(med);               // [extrapolated floor, GLP-1 trial floor]

    // Effectiveness of the user's habits, 0 (none) to 1 (full protocol). Training
    // is the primary driver; protein enables it (Morton 2018).
    var pFactor = { low: 0, lowmid: 0.25, mid: 0.5, midhigh: 0.75, high: 1 }[protein] || 0;
    var tFactor = training === "full" ? 1 : training === "some" ? 0.5 : 0;
    var E = 0.65 * tFactor + 0.35 * pFactor;
    var youA = withoutFrac - E * (withoutFrac - planRange[0]);
    var youB = withoutFrac - E * (withoutFrac - planRange[1]);

    $("youFrac").textContent = pctRange(youA, youB);
    $("withoutFrac").textContent = pctRange(withoutFrac, withoutFrac);
    $("withFrac").textContent = pctRange(planRange[0], planRange[1]);

    var summary = "Estimated lean mass share of your weight loss at your current habits: " + $("youFrac").textContent +
      ". Without countermeasures: " + $("withoutFrac").textContent + ". With countermeasures: " + $("withFrac").textContent + ".";

    if (goalKg > 0 && goalKg < kg) {
      var lossKg = kg - goalKg;
      var unit = wu === "kg" ? "kg" : "lb";
      var conv = wu === "kg" ? 1 : 1 / LB;
      var one = function (fracKg) { return (fracKg * conv).toFixed(1); };
      var range = function (a, b) {
        var x = one(Math.min(a, b)), y = one(Math.max(a, b));
        return (x === y ? x : x + " to " + y) + " " + unit;
      };
      $("totalLoss").textContent = (lossKg * conv).toFixed(0) + " " + unit;
      $("withoutKg").textContent = range(lossKg * withoutFrac, lossKg * withoutFrac);
      $("youKg").textContent = range(lossKg * youA, lossKg * youB);
      $("withKg").textContent = range(lossKg * planRange[0], lossKg * planRange[1]);
      $("goalWrap").hidden = false;
      summary += " Over " + $("totalLoss").textContent + " of weight loss, lean mass at risk is " + $("youKg").textContent + " at your habits.";
    } else {
      $("goalWrap").hidden = true;
    }

    $("out").hidden = false;
    announce(summary);
  }

  // Changing lb/kg used to relabel the number you had already typed (210 lb became 210 kg).
  var prevUnit = $("weightUnit").value;
  function convertOnUnitChange() {
    var now = $("weightUnit").value;
    if (now === prevUnit) return;
    ["weight", "goal"].forEach(function (id) {
      var v = num(id);
      if (v > 0) { $(id).value = String(Math.round((now === "kg" ? v * LB : v / LB) * 10) / 10); }
    });
    prevUnit = now;
    setUnitLimits();
  }

  // The fields are seeded so a result is on screen at once. That result describes an
  // example person, not the visitor, and the note says so until the first edit.
  var SEED = { weight: '210', weightUnit: 'lb', goal: '170', med: 'sema', protein: 'mid', training: 'some' };
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
    // render would make calc_use a synonym for pageviews.
    if (window.mogTrack) window.mogTrack("calc_use", "muscle-loss");
  }

  seed();
  setUnitLimits();
  prevUnit = $("weightUnit").value;
  compute();
  // Seeded render: set the live text at once rather than after the debounce.
  clearTimeout(liveTimer);

  form.addEventListener("input", function () { markTouched(); compute(); });
  form.addEventListener("change", function (e) {
    if (e.target && e.target.id === "weightUnit") { convertOnUnitChange(); }
    markTouched(); compute();
  });
  // Typing replaces the example instead of appending to it.
  form.addEventListener("focusin", function (e) {
    var t = e.target;
    if (t && t.tagName === "INPUT" && t.type === "number") { try { t.select(); } catch (err) { /* ignore */ } }
  });
  form.addEventListener("submit", function (e) { e.preventDefault(); markTouched(); compute(); });
})();
