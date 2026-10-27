// Muscle strength check. Compares grip strength and a five-times chair-stand
// time with the EWGSOP2 cut-offs for low muscle strength (Cruz-Jentoft 2019:
// grip < 27 kg men, < 16 kg women; chair stand > 15 s), and shows the change in
// grip since an optional previous reading. Each bar puts the cut-off at a fixed
// mark so "above" and "below" read the same way for both tests.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $("calc"); if (!form) return;
  var LB = 0.45359237, GRIP_CUT = { male: 27, female: 16 }, CHAIR_CUT = 15;
  var live = $("liveSummary"), liveTimer = null, touched = false;

  function num(id) { var v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : NaN; }

  function compute(announce) {
    var sex = $("sex").value, unit = $("unit").value;
    var toKg = unit === "lb" ? LB : 1;
    var cutKg = GRIP_CUT[sex], cutShown = unit === "lb" ? Math.round(cutKg / LB) : cutKg;
    $("gripCut").textContent = "cut-off " + cutShown + " " + unit + " for " + (sex === "male" ? "men" : "women") + "; higher is better";
    var parts = [];

    var g = num("grip");
    if (g) {
      var gKg = g * toKg;
      $("gripOut").textContent = (Math.round(g * 10) / 10) + " " + unit;
      // Scale: the cut-off sits at 50% of the bar, twice the cut-off fills it.
      $("gripFill").style.width = Math.min(100, gKg / (cutKg * 2) * 100) + "%";
      $("gripMark").style.left = "50%";
      var low = gKg < cutKg;
      $("gripVerdict").textContent = low
        ? "Below the cut-off for low muscle strength. Worth raising with a clinician, and worth retesting in four weeks."
        : "Above the cut-off. Track it every four weeks: a falling trend matters even above the line.";
      $("gripVerdict").className = "sr-verdict" + (low ? " sr-low" : "");
      parts.push("Grip " + $("gripOut").textContent + (low ? ", below" : ", above") + " the cut-off.");
    } else {
      $("gripOut").textContent = ""; $("gripVerdict").textContent = "Enter a grip reading."; $("gripFill").style.width = "0";
    }

    var c = num("chair");
    if (c) {
      $("chairOut").textContent = (Math.round(c * 10) / 10) + " s";
      // Faster is better, so the bar fills as time drops: 30 s or slower is empty, 0 s full; the cut-off sits at 50%.
      $("chairFill").style.width = Math.max(0, Math.min(100, (1 - c / (CHAIR_CUT * 2)) * 100)) + "%";
      $("chairMark").style.left = "50%";
      var slow = c > CHAIR_CUT;
      $("chairVerdict").textContent = slow
        ? "Slower than 15 seconds, which also flags low strength. Leg strength responds well to training."
        : "Within the cut-off. Retest on the same chair to compare.";
      $("chairVerdict").className = "sr-verdict" + (slow ? " sr-low" : "");
      parts.push("Chair stand " + $("chairOut").textContent + (slow ? ", slower than" : ", within") + " the cut-off.");
    } else {
      $("chairOut").textContent = ""; $("chairVerdict").textContent = "Enter a chair-stand time."; $("chairFill").style.width = "0";
    }

    var p = num("prev");
    if (g && p) {
      var d = Math.round((g - p) * 10) / 10, pct = Math.round((g - p) / p * 100);
      $("changeOut").textContent = (d > 0 ? "+" : d < 0 ? "−" : "") + Math.abs(d) + " " + unit;
      $("changeNote").textContent = "Grip change since last time (" + (pct > 0 ? "+" : pct < 0 ? "−" : "") + Math.abs(pct) + "%). " +
        (d < 0 ? "A drop is worth watching; check protein and whether training has slipped." : "Holding or rising while you lose weight is a good sign.");
      $("changeRow").hidden = false;
      parts.push("Grip change " + $("changeOut").textContent + ".");
    } else { $("changeRow").hidden = true; }

    if (announce) { clearTimeout(liveTimer); liveTimer = setTimeout(function () { live.textContent = parts.join(" "); }, 500); }
  }

  function markTouched() {
    if (touched) return;
    touched = true;
    Array.prototype.forEach.call(document.querySelectorAll(".calc-example-note"), function (n) { n.hidden = true; });
    if (window.mogTrack) window.mogTrack("calc_use", "strength-check");
  }

  var prevUnit = $("unit").value;
  form.addEventListener("input", function () { markTouched(); compute(true); });
  form.addEventListener("change", function (e) {
    if (e.target.id === "unit" && e.target.value !== prevUnit) {
      ["grip", "prev"].forEach(function (id) {
        var v = num(id);
        if (v) $(id).value = String(Math.round((e.target.value === "lb" ? v / LB : v * LB) * 10) / 10);
      });
      prevUnit = e.target.value;
    }
    markTouched(); compute(true);
  });
  form.addEventListener("focusin", function (e) {
    if (e.target.tagName === "INPUT" && e.target.type === "number") { try { e.target.select(); } catch (err) { /* ignore */ } }
  });
  form.addEventListener("submit", function (e) { e.preventDefault(); });

  // Chair-stand stopwatch: a 3-second countdown so the person can sit and cross
  // their arms, then a running clock. Stop writes the time into the chair field
  // and fires "input", so the result, the URL and the share link all update.
  var tBtn = $("chairTimer"), tOut = $("timerOut"), tBox = tBtn && tBtn.parentNode;
  var tState = "idle", tStart = 0, tFrame = 0, tCount = 0;
  function tShow(text, cls, label) { tOut.textContent = text; tBox.className = "sr-timer" + (cls ? " " + cls : ""); tBtn.textContent = label; }
  function tTick() {
    tOut.textContent = ((performance.now() - tStart) / 1000).toFixed(1) + " s";
    tFrame = requestAnimationFrame(tTick);
  }
  function tReset() { clearInterval(tCount); cancelAnimationFrame(tFrame); tState = "idle"; }
  if (tBtn) tBtn.addEventListener("click", function () {
    if (tState === "idle") {
      var n = 3;
      tState = "counting"; tShow(n + "…", "counting", "Cancel");
      tCount = setInterval(function () {
        n--;
        if (n > 0) { tOut.textContent = n + "…"; return; }
        clearInterval(tCount);
        tState = "running"; tStart = performance.now();
        tShow("0.0 s", "running", "Stop");
        if (navigator.vibrate) navigator.vibrate(150);
        tTick();
      }, 1000);
    } else if (tState === "counting") {
      tReset(); tShow("0.0 s", "", "Start the timer");
    } else {
      var sec = Math.round((performance.now() - tStart) / 100) / 10;
      tReset(); tShow(sec.toFixed(1) + " s", "", "Time it again");
      $("chair").value = String(sec);
      $("chair").dispatchEvent(new Event("input", { bubbles: true }));
      if (window.mogTrack) window.mogTrack("calc_timer", "strength-check");
    }
  });
  compute(false);
})();
