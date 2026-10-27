// Shared calculator enhancements, loaded on every calculator page BEFORE that
// page's own calc.js (plain <script>, not defer). It changes no arithmetic.
//
// 1. Segmented choices. A <select> with a few short options (lb/kg, in/cm,
//    Female/Male, 3/4/5 meals) becomes a row of buttons: one tap instead of
//    open-scroll-tap, and every choice is visible. The <select> stays in the
//    form as the source of truth and is only hidden, so calc.js keeps reading
//    it. A button sets its value and dispatches a bubbling "change" from the
//    select itself, so calc.js's unit conversion (which checks e.target.id)
//    runs exactly as it did for a real select.
//
// 2. Shareable results. The form's fields are written to the URL query as the
//    visitor edits (replaceState, no history spam), and read back on load.
//    calc.js seeds only EMPTY inputs, and a select always has a value, so
//    values restored here before calc.js runs survive its seeding. A
//    "Copy link to these results" button shares that URL; on a phone it opens
//    the share sheet. Restored numbers are the visitor's own, so the
//    "these are example numbers" notes are hidden for a restored link.
(function () {
  var form = document.getElementById("calc");
  if (!form) return;
  var tool = (location.pathname.split("/")[1] || "calc").replace(/-calculator$/, "");

  function fields() {
    return Array.prototype.filter.call(form.elements, function (el) {
      return el.name && (el.tagName === "SELECT" || (el.tagName === "INPUT" && el.type !== "email"));
    });
  }

  // ---- 2a. Restore from the query string (runs first, before calc.js seeds).
  var params = new URLSearchParams(location.search);
  var restored = false;
  fields().forEach(function (el) {
    if (!params.has(el.name)) return;
    var v = params.get(el.name).slice(0, 24);
    if (el.tagName === "SELECT") {
      if (Array.prototype.some.call(el.options, function (o) { return o.value === v; })) { el.value = v; restored = true; }
    } else if (/^-?\d*\.?\d+$/.test(v)) {
      el.value = v; restored = true;
    }
  });
  if (restored) {
    document.addEventListener("DOMContentLoaded", function () {
      Array.prototype.forEach.call(document.querySelectorAll(".calc-example-note"), function (n) { n.hidden = true; });
    });
  }

  // ---- 1. Segmented choices.
  function shortEnough(sel) {
    var n = sel.options.length;
    if (n < 2 || n > 5) return false;
    var total = 0;
    for (var i = 0; i < n; i++) {
      var t = sel.options[i].textContent.trim();
      if (t.length > 12) return false;
      total += t.length;
    }
    return total <= 32;
  }

  // "3 meals / 4 meals / 5 meals" shows as "3 / 4 / 5": the label already says
  // "Meals per day", and the shared word is what overflowed a phone-width row.
  function sharedSuffix(sel) {
    var words = Array.prototype.map.call(sel.options, function (o) { return o.textContent.trim().split(/\s+/); });
    var last = words[0].length > 1 ? words[0][words[0].length - 1] : null;
    return last && words.every(function (w) { return w.length > 1 && w[w.length - 1] === last; }) ? " " + last : "";
  }

  Array.prototype.forEach.call(form.querySelectorAll("select"), function (sel) {
    if (!shortEnough(sel)) return;
    var suffix = sharedSuffix(sel);
    var label = form.querySelector('label[for="' + sel.id + '"]');
    var group = document.createElement("div");
    group.className = "seg";
    group.setAttribute("role", "radiogroup");
    if (label) {
      if (!label.id) label.id = sel.id + "Label";
      group.setAttribute("aria-labelledby", label.id);
      // The label pointed at the hidden select; point a click at the group instead.
      label.addEventListener("click", function (e) {
        e.preventDefault();
        var on = group.querySelector('[aria-checked="true"]');
        if (on) on.focus();
      });
    } else {
      group.setAttribute("aria-label", sel.id === "heightUnit" || sel.id === "weightUnit" ? "Unit" : sel.name);
    }
    var buttons = Array.prototype.map.call(sel.options, function (opt) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "seg-b";
      b.setAttribute("role", "radio");
      var text = opt.textContent.trim();
      b.textContent = suffix ? text.slice(0, -suffix.length) : text;
      if (suffix) b.setAttribute("aria-label", text);
      b.dataset.value = opt.value;
      b.addEventListener("click", function () { choose(opt.value, true); });
      group.appendChild(b);
      return b;
    });
    function sync() {
      buttons.forEach(function (b) {
        var on = b.dataset.value === sel.value;
        b.setAttribute("aria-checked", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
    }
    function choose(v, fire) {
      if (sel.value === v) return;
      sel.value = v;
      sync();
      if (fire) sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    // Arrow keys move the choice, as in a native radio group.
    group.addEventListener("keydown", function (e) {
      var i = sel.selectedIndex, n = sel.options.length;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") i = (i + 1) % n;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") i = (i - 1 + n) % n;
      else return;
      e.preventDefault();
      choose(sel.options[i].value, true);
      buttons[i].focus();
    });
    // calc.js may set the select itself (seeding, resets); keep the buttons honest.
    sel.addEventListener("change", sync);
    sync();
    sel.hidden = true;
    sel.setAttribute("aria-hidden", "true");
    sel.tabIndex = -1;
    sel.parentNode.insertBefore(group, sel.nextSibling);
    // Runs again after calc.js seeds, which happens after this script.
    document.addEventListener("DOMContentLoaded", sync);
  });

  // ---- 2b. Keep the URL in step with the form, and offer a share link.
  function stateUrl() {
    var q = new URLSearchParams();
    fields().forEach(function (el) { if (el.value !== "") q.set(el.name, el.value); });
    return location.origin + location.pathname + "?" + q.toString();
  }
  var urlTimer = null;
  function writeUrl() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(function () {
      try { history.replaceState(null, "", stateUrl().slice(location.origin.length)); } catch (e) { /* sandboxed */ }
    }, 400);
  }
  form.addEventListener("input", writeUrl);
  form.addEventListener("change", writeUrl);

  var bar = document.createElement("div");
  bar.className = "calc-share";
  bar.innerHTML =
    '<button type="button" class="calc-share-b">Copy link to these results</button>' +
    '<button type="button" class="calc-share-b calc-print-b">Print for your appointment</button>' +
    '<span class="calc-share-s" role="status" aria-live="polite"></span>';
  var btn = bar.querySelector("button"), status = bar.querySelector("span");
  // A one-page printout (print CSS in styles.css drops the nav, ads, sign-up
  // and gear blocks) for people who want to take their numbers to a clinician.
  bar.querySelector(".calc-print-b").addEventListener("click", function () {
    if (window.mogTrack) window.mogTrack("calc_print", tool);
    window.print();
  });
  var clearT = null;
  btn.addEventListener("click", function () {
    var url = stateUrl();
    if (window.mogTrack) window.mogTrack("calc_share", tool);
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      navigator.share({ title: document.title, url: url }).catch(function () {});
      return;
    }
    function done(ok) {
      status.textContent = ok ? "Link copied. Anyone who opens it sees these numbers." : url;
      clearTimeout(clearT);
      clearT = setTimeout(function () { status.textContent = ""; }, 6000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); });
    } else { done(false); }
  });
  var body = form.querySelector(".price-body") || form;
  body.appendChild(bar);
})();
