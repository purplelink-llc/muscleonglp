// Protein food calculator: servings of 13 USDA-valued foods, summed and set
// against a 1.2-1.6 g/kg daily target (the GLP-1 joint advisory range, the
// same ADV_LOW/ADV_HIGH the protein calculator uses). Each food is a real
// number input (name = food key), so calc-ui.js puts the day in the URL and
// "Copy link" shares it. The +/- buttons step by half a serving.
(function () {
  var form = document.getElementById("calc");
  if (!form) return;
  var LB = 0.45359237, LOW = 1.2, HIGH = 1.6, MAX = 10;
  function $(id) { return document.getElementById(id); }
  var inputs = Array.prototype.slice.call(form.querySelectorAll(".pf-in"));
  var touched = false, liveTimer = null;

  function clamp(v) { v = Math.round(v * 2) / 2; return Math.max(0, Math.min(MAX, isFinite(v) ? v : 0)); }

  function compute(announce) {
    var w = parseFloat($("weight").value);
    var kg = $("weightUnit").value === "kg" ? w : w * LB;
    var total = 0;
    inputs.forEach(function (el) {
      var n = clamp(parseFloat(el.value) || 0);
      total += n * Number(el.dataset.g);
      el.closest(".pf-row").classList.toggle("on", n > 0);
    });
    total = Math.round(total);
    $("pfTotal").textContent = String(total);
    var ok = kg >= 30 && kg <= 300;
    if (!ok) {
      $("pfTarget").textContent = "your target (enter a weight)";
      $("pfFill").style.width = "0"; $("pfBand").style.cssText = ""; $("pfLeft").textContent = "";
      return;
    }
    var lo = Math.round(kg * LOW), hi = Math.round(kg * HIGH);
    $("pfTarget").textContent = lo + " to " + hi + " g";
    // The bar's full width is 1.25x the high end, so the target band sits inside it.
    var scale = hi * 1.25;
    $("pfFill").style.width = Math.min(100, total / scale * 100) + "%";
    $("pfBand").style.left = (lo / scale * 100) + "%";
    $("pfBand").style.width = ((hi - lo) / scale * 100) + "%";
    var left;
    if (total === 0) left = "Tap + on the foods you eat in a typical day.";
    else if (total < lo) left = (lo - total) + " g to go to reach the low end.";
    else if (total <= hi) left = "In the target range.";
    else left = (total - hi) + " g above the high end, more than most people need.";
    $("pfLeft").textContent = left;
    form.classList.toggle("pf-hit", total >= lo);
    if (announce) {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(function () { $("pfLive").textContent = total + " grams of protein. " + left; }, 600);
    }
  }

  function markTouched() {
    if (touched) return;
    touched = true;
    if (window.mogTrack) window.mogTrack("calc_use", "protein-food");
  }

  form.addEventListener("click", function (e) {
    var b = e.target.closest(".pf-b");
    if (!b) return;
    var el = b.parentNode.querySelector(".pf-in");
    el.value = String(clamp((parseFloat(el.value) || 0) + Number(b.dataset.d)));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  $("pfReset").addEventListener("click", function () {
    inputs.forEach(function (el) { el.value = "0"; });
    inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
  });

  var prevUnit = $("weightUnit").value;
  form.addEventListener("input", function () { markTouched(); compute(true); });
  form.addEventListener("change", function (e) {
    if (e.target.id === "weightUnit" && e.target.value !== prevUnit) {
      var w = parseFloat($("weight").value);
      if (w > 0) $("weight").value = String(Math.round((e.target.value === "kg" ? w * LB : w / LB) * 10) / 10);
      prevUnit = e.target.value;
    }
    if (e.target.classList.contains("pf-in")) e.target.value = String(clamp(parseFloat(e.target.value) || 0));
    markTouched(); compute(true);
  });
  form.addEventListener("focusin", function (e) {
    if (e.target.tagName === "INPUT" && e.target.type === "number") { try { e.target.select(); } catch (err) { /* ignore */ } }
  });
  form.addEventListener("submit", function (e) { e.preventDefault(); });
  compute(false);
})();
