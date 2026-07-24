// Client wiring for the GLP-1 muscle survey. Mirrors subscribe.js: inline
// status (never window.alert), and the form is replaced by a thank-you on
// success so nobody double-submits by reflex.
//
// Progressive enhancement is limited here by design: without JS there is no
// submission, because a no-JS POST would need a full page endpoint and this is
// a short-lived research form. The page says so in its status line.
(function () {
  var form = document.getElementById("survey");
  if (!form) return;

  var statusEl = document.getElementById("sv-status");
  var btn = form.querySelector('button[type="submit"]');
  var originalLabel = btn ? btn.textContent : "";
  // Required questions must match REQUIRED in netlify/functions/survey.mjs.
  var REQUIRED = ["med", "duration", "training", "tracks", "clinician", "stopping"];
  // Field -> the question number actually shown on the page. Not the index in
  // REQUIRED: questions 5 and 8 are optional, so the two would disagree and the
  // error would point people at the wrong question.
  var QUESTION_NO = { med: 1, duration: 2, training: 3, tracks: 4, grams: 5, clinician: 6, stopping: 7, strength: 8 };

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.innerHTML = isError
      ? '<span class="checkout-err">' + msg + "</span>"
      : msg;
  }

  function value(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var payload = {};
    ["med", "duration", "training", "tracks", "grams", "clinician", "stopping", "strength"]
      .forEach(function (n) { payload[n] = value(n); });
    var hp = form.querySelector('input[name="hp"]');
    payload.hp = hp ? hp.value : "";

    var missing = REQUIRED.filter(function (n) { return !payload[n]; });
    if (missing.length) {
      setStatus("Please answer question" + (missing.length > 1 ? "s" : "") + " " +
        missing.map(function (n) { return QUESTION_NO[n]; }).join(", ") +
        " before submitting.", true);
      var firstMissing = form.querySelector('input[name="' + missing[0] + '"]');
      if (firstMissing) firstMissing.focus();
      return;
    }

    if (btn) { btn.textContent = "Sending…"; btn.setAttribute("aria-disabled", "true"); }
    setStatus("", false);

    fetch("/.netlify/functions/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (resp) {
        if (!resp.ok) return resp.json().then(function (p) { throw p; });
        return resp.json();
      })
      .then(function () {
        if (window.mogTrack) window.mogTrack("survey_submit", "survey");
        var thanks = document.createElement("div");
        thanks.className = "subscribe-thanks";
        thanks.innerHTML =
          "<p><strong>Thank you.</strong> Your answers are recorded, anonymously.</p>" +
          "<p>We will publish the aggregate once enough people have responded to " +
          "describe it honestly, with the sample size and limitations stated.</p>";
        form.parentNode.replaceChild(thanks, form);
        thanks.setAttribute("tabindex", "-1");
        thanks.focus();
      })
      .catch(function (err) {
        if (btn) { btn.textContent = originalLabel; btn.setAttribute("aria-disabled", "false"); }
        setStatus((err && err.detail) || "We could not record that just now. Please try again shortly.", true);
      });
  });
})();
