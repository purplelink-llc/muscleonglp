// Shared lean-mass model for the muscle-loss and calorie/protein calculators.
// External file (site CSP is script-src 'self'). One place for the numbers, so the
// two tools cannot disagree about the same "no plan" scenario again (they used 40%
// and 30%).
//
// Sources, each cited on the calculator pages:
//   HIGH_END 0.40, LOW_END 0.15: the 15 to 40% range of lean mass as a share of GLP-1
//     weight loss in trial data (Neeland 2024).
//   BASE_SEMA 0.33, BASE_TIRZ 0.26: central shares; tirzepatide from the SURMOUNT-1
//     DXA substudy (via Neeland 2024).
//   OFFSET 0.935: resistance training offset about 93.5% of diet-induced lean-mass
//     loss in older adults with obesity on caloric restriction, NOT in GLP-1 users
//     (Sardeli 2018). Applying it to the GLP-1 baseline is an extrapolation, so the
//     "with countermeasures" scenario is shown as a range: the extrapolated floor
//     (baseline x 6.5%, about 2%) up to LOW_END, the lowest share seen in GLP-1 trials.
(function () {
  var HIGH_END = 0.40, LOW_END = 0.15, OFFSET = 0.935;
  var BASE = { sema: 0.33, other: 0.33, tirz: 0.26 };
  function base(med) { return BASE[med] || BASE.sema; }
  window.MOG_MODEL = {
    HIGH_END: HIGH_END, LOW_END: LOW_END, OFFSET: OFFSET,
    // No countermeasures: the high end of the published range, scaled by the
    // medication's measured baseline relative to semaglutide's.
    noPlan: function (med) { return HIGH_END * (base(med) / BASE.sema); },
    // Best case with countermeasures, as [floor, ceiling].
    plan: function (med) { return [base(med) * (1 - OFFSET), LOW_END]; }
  };
})();
