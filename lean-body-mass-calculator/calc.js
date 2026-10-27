// Lean body mass calculator. LBM from height, weight and sex as the mean of the
// Boer (1984) and Hume (1966) equations (both shown as a range), then the
// lean mass a GLP-1 loss could take, from the shared model in /glp1-model.js
// (the same no-plan and plan shares the muscle-loss calculator uses).
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $("calc"); if (!form) return;
  var M = window.MOG_MODEL; if (!M) return;
  var LB = 0.45359237, INCH = 2.54;
  var errBox = $("calcError"), live = $("liveSummary"), liveTimer = null, touched = false;

  function boer(sex, kg, cm) { return sex === "male" ? 0.407 * kg + 0.267 * cm - 19.2 : 0.252 * kg + 0.473 * cm - 48.3; }
  function hume(sex, kg, cm) { return sex === "male" ? 0.32810 * kg + 0.33929 * cm - 29.5336 : 0.29569 * kg + 0.41813 * cm - 43.2933; }

  function compute(announce) {
    var sex = $("sex").value, med = $("med").value;
    var wu = $("weightUnit").value, hu = $("heightUnit").value;
    var w = parseFloat($("weight").value), h = parseFloat($("height").value), g = parseFloat($("goal").value);
    var kg = wu === "kg" ? w : w * LB, cm = hu === "cm" ? h : h * INCH;
    var conv = wu === "kg" ? 1 : 1 / LB, unit = wu;
    function fmt(x) { return (x * conv).toFixed(1) + " " + unit; }
    if (!(cm >= 120 && cm <= 230) || !(kg >= 35 && kg <= 320)) {
      errBox.textContent = "Enter a height of 120 to 230 cm (47 to 90 in) and a weight of 35 to 320 kg (77 to 705 lb).";
      errBox.hidden = false; $("out").hidden = true; return;
    }
    errBox.hidden = true;
    var a = boer(sex, kg, cm), b = hume(sex, kg, cm), lbm = (a + b) / 2;
    $("lbm").textContent = fmt(lbm);
    $("lbmRange").textContent = "Boer " + fmt(a) + ", Hume " + fmt(b);
    $("fatPct").textContent = Math.max(0, Math.round((1 - lbm / kg) * 100)) + "%";

    var goalKg = g > 0 ? (wu === "kg" ? g : g * LB) : NaN;
    var summary = "Estimated lean body mass " + fmt(lbm) + ".";
    if (goalKg > 0 && goalKg < kg) {
      var lossKg = kg - goalKg, no = M.noPlan(med), plan = M.plan(med);
      var noKg = lossKg * no, pLo = lossKg * plan[0], pHi = lossKg * plan[1];
      $("loss").textContent = fmt(lossKg);
      $("noPlanLoss").textContent = fmt(noKg);
      $("noPlanPct").textContent = Math.round(noKg / lbm * 100) + "% of your lean mass";
      $("planLoss").textContent = (pLo * conv).toFixed(1) + " to " + fmt(pHi);
      $("planPct").textContent = Math.round(pLo / lbm * 100) + " to " + Math.round(pHi / lbm * 100) + "% of your lean mass";
      var bars = $("lbmBars").querySelectorAll(".rb-fill");
      bars[0].style.width = Math.min(100, noKg / lbm * 100) + "%";
      bars[0].nextElementSibling.style.width = "0";
      bars[1].style.width = Math.min(100, pLo / lbm * 100) + "%";
      bars[1].nextElementSibling.style.left = Math.min(100, pLo / lbm * 100) + "%";
      bars[1].nextElementSibling.style.width = Math.min(100, (pHi - pLo) / lbm * 100) + "%";
      $("goalWrap").hidden = false;
      summary += " Losing " + fmt(lossKg) + " could take " + fmt(noKg) + " of it without a plan, or " + $("planLoss").textContent + " with one.";
    } else {
      $("loss").textContent = "";
      $("goalWrap").hidden = true;
    }
    $("out").hidden = false;
    if (announce) { clearTimeout(liveTimer); liveTimer = setTimeout(function () { live.textContent = summary; }, 500); }
  }

  function markTouched() {
    if (touched) return;
    touched = true;
    Array.prototype.forEach.call(document.querySelectorAll(".calc-example-note"), function (n) { n.hidden = true; });
    if (window.mogTrack) window.mogTrack("calc_use", "lean-body-mass");
  }

  var prevW = $("weightUnit").value, prevH = $("heightUnit").value;
  form.addEventListener("input", function () { markTouched(); compute(true); });
  form.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "weightUnit" && t.value !== prevW) {
      ["weight", "goal"].forEach(function (id) { var v = parseFloat($(id).value); if (v > 0) $(id).value = String(Math.round((t.value === "kg" ? v * LB : v / LB) * 10) / 10); });
      prevW = t.value;
    }
    if (t.id === "heightUnit" && t.value !== prevH) {
      var v = parseFloat($("height").value); if (v > 0) $("height").value = String(Math.round((t.value === "cm" ? v * INCH : v / INCH) * 10) / 10);
      prevH = t.value;
    }
    markTouched(); compute(true);
  });
  form.addEventListener("focusin", function (e) {
    if (e.target.tagName === "INPUT" && e.target.type === "number") { try { e.target.select(); } catch (err) { /* ignore */ } }
  });
  form.addEventListener("submit", function (e) { e.preventDefault(); });
  compute(false);
})();
