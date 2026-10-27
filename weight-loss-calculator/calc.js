// GLP-1 weight-loss calculator. External file (site CSP is script-src 'self').
// Applies a trial's AVERAGE percent weight change to the weight you enter. It is
// not a prediction for one person: individual results in every trial ranged
// widely around the mean. Lean-mass shares come from the shared model in
// /glp1-model.js so all calculators agree.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $("calc"); if (!form) return;
  var M = window.MOG_MODEL; if (!M) return;

  // Mean percent change in body weight in the treatment arm, from each trial's
  // primary publication. `ref` is the trial's number in the page's reference
  // list (the result links to #ref-N), so renumbering the list means updating it.
  var SCENARIOS = {
    "wegovy":     { label: "Wegovy (semaglutide 2.4 mg)",          trial: "STEP 1",      weeks: 68, pct: 14.9, placebo: 2.4, med: "sema", ref: 1 },
    "wegovy-7":   { label: "Wegovy 7.2 mg (semaglutide)",          trial: "STEP UP",     weeks: 72, pct: 18.7, placebo: 3.9, med: "sema", ref: 6 },
    "wegovy-t2d": { label: "Semaglutide 2.4 mg, type 2 diabetes",  trial: "STEP 2",      weeks: 68, pct: 9.6,  placebo: 3.4, med: "sema", ref: 3 },
    "ozempic-1":  { label: "Semaglutide 1 mg (Ozempic dose), type 2 diabetes", trial: "STEP 2", weeks: 68, pct: 7.0, placebo: 3.4, med: "sema", ref: 3 },
    "tirz-5":     { label: "Zepbound/Mounjaro (tirzepatide 5 mg)",  trial: "SURMOUNT-1",  weeks: 72, pct: 15.0, placebo: 3.1, med: "tirz", ref: 2 },
    "tirz-10":    { label: "Zepbound/Mounjaro (tirzepatide 10 mg)", trial: "SURMOUNT-1",  weeks: 72, pct: 19.5, placebo: 3.1, med: "tirz", ref: 2 },
    "tirz-15":    { label: "Zepbound/Mounjaro (tirzepatide 15 mg)", trial: "SURMOUNT-1",  weeks: 72, pct: 20.9, placebo: 3.1, med: "tirz", ref: 2 },
    "orfo-36":    { label: "Foundayo (orforglipron 36 mg, pill)", trial: "ATTAIN-1",    weeks: 72, pct: 11.2, placebo: 2.1, med: "other", ref: 9 },
    "reta-12":    { label: "Retatrutide 12 mg (investigational)",  trial: "Phase 2",     weeks: 48, pct: 24.2, placebo: 2.1, med: "other", ref: 5 }
  };
  var ORDER = ["ozempic-1", "wegovy-t2d", "orfo-36", "wegovy", "wegovy-7", "tirz-5", "tirz-10", "tirz-15", "reta-12"];

  var errBox = $("calcError"), liveBox = $("liveSummary"), liveTimer = null;

  function fmt(x, unit) { return (Math.round(x * 10) / 10).toLocaleString() + " " + unit; }
  function pct(x) { return Math.round(x * 100) + "%"; }
  function pctRange(a, b) {
    var lo = Math.round(Math.min(a, b) * 100), hi = Math.round(Math.max(a, b) * 100);
    return lo === hi ? lo + "%" : lo + " to " + hi + "%";
  }
  function announce(text) {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () { liveBox.textContent = text; }, 500);
  }
  function showError(msg) {
    errBox.textContent = msg; errBox.hidden = false;
    $("weight").setAttribute("aria-invalid", "true"); $("out").hidden = true;
  }
  function clearError() { errBox.hidden = true; errBox.textContent = ""; $("weight").removeAttribute("aria-invalid"); }

  // Horizontal bars: every scenario's trial-average loss, the chosen one highlighted,
  // each with its placebo arm as a tick. Built as SVG so it scales and follows the theme.
  function chart(selected) {
    var rowH = 34, w = 640, labelW = 300, barMax = w - labelW - 60, maxPct = 26;
    var h = ORDER.length * rowH + 30;
    var out = ['<svg viewBox="0 0 ' + w + " " + h + '" role="img" aria-labelledby="chartTitle chartDesc" style="width:100%;height:auto;display:block;color:var(--ink)">',
      '<title id="chartTitle">Average weight loss by medication in its main trial</title>',
      '<desc id="chartDesc">Bars show each trial\'s average percent weight loss in the treatment arm. Thin marks show the placebo arm.</desc>'];
    ORDER.forEach(function (key, i) {
      var s = SCENARIOS[key], y = i * rowH + 6, bw = barMax * s.pct / maxPct, px = labelW + barMax * s.placebo / maxPct;
      var on = key === selected;
      out.push('<text x="0" y="' + (y + 17) + '" font-size="12.5" fill="currentColor" opacity="' + (on ? 1 : 0.75) + '"' + (on ? ' font-weight="700"' : "") + ">" + s.label + "</text>");
      out.push('<rect x="' + labelW + '" y="' + (y + 4) + '" width="' + bw.toFixed(1) + '" height="18" rx="4" fill="var(--accent-text)" opacity="' + (on ? 1 : 0.35) + '"></rect>');
      out.push('<line x1="' + px.toFixed(1) + '" x2="' + px.toFixed(1) + '" y1="' + (y + 1) + '" y2="' + (y + 25) + '" stroke="currentColor" stroke-width="2" opacity="0.6"></line>');
      out.push('<text x="' + (labelW + bw + 8).toFixed(1) + '" y="' + (y + 18) + '" font-size="13" fill="currentColor"' + (on ? ' font-weight="700"' : "") + ">−" + s.pct.toFixed(1) + "%</text>");
    });
    out.push('<text x="0" y="' + (h - 4) + '" font-size="11" fill="currentColor" opacity="0.7">Bar: treatment average. Tick: placebo. Trial length 48 to 72 weeks.</text>');
    out.push("</svg>");
    return out.join("");
  }

  // Stacked bar: the loss split into lean mass and fat.
  function splitBar(leanShare, title) {
    return '<div style="margin-top:12px"><p class="calc-l" style="margin:0 0 6px">' + title + '</p>' +
      '<div style="display:flex;height:22px;border-radius:6px;overflow:hidden;border:1px solid var(--line)" aria-hidden="true">' +
      '<span style="width:' + (leanShare * 100).toFixed(1) + '%;background:#b7791f"></span>' +
      '<span style="flex:1;background:var(--accent);opacity:.55"></span></div></div>';
  }

  function run() {
    var w = parseFloat($("weight").value), unit = $("weightUnit").value, key = $("scenario").value;
    var s = SCENARIOS[key];
    var min = unit === "kg" ? 40 : 90, max = unit === "kg" ? 320 : 700;
    if (!isFinite(w) || w < min || w > max) { showError("Enter a weight between " + min + " and " + max + " " + unit + "."); return; }
    clearError();

    var loss = w * s.pct / 100, endW = w - loss, placeboLoss = w * s.placebo / 100;
    var noPlan = M.noPlan(s.med), plan = M.plan(s.med);

    $("endWeight").textContent = fmt(endW, unit);
    $("lossAmt").textContent = fmt(loss, unit) + " (−" + s.pct.toFixed(1) + "%)";
    $("placeboAmt").textContent = fmt(placeboLoss, unit) + " (−" + s.placebo.toFixed(1) + "%)";
    $("trialNote").textContent = s.trial + ", " + s.weeks + " weeks";
    $("leanNoPlan").textContent = fmt(loss * noPlan, unit) + " (" + pct(noPlan) + " of the loss)";
    $("leanPlan").textContent = fmt(loss * plan[0], unit) + " to " + fmt(loss * plan[1], unit) + " (" + pctRange(plan[0], plan[1]) + ")";
    $("splits").innerHTML =
      splitBar(noPlan, "Without protein and training (amber is lean mass, green is fat)") +
      splitBar(plan[1], "With both, upper end of the best case");
    $("chart").innerHTML = chart(key);
    $("refLink").setAttribute("href", "#ref-" + s.ref);
    $("out").hidden = false;
    announce("Trial average for " + s.label + ": about " + fmt(endW, unit) + " after " + s.weeks + " weeks, a loss of " + fmt(loss, unit) + ".");
  }

  form.addEventListener("input", run);
  form.addEventListener("change", run);
  form.addEventListener("submit", function (e) { e.preventDefault(); run(); });
  run();
})();
