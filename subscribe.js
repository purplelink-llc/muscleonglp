// Email-capture wiring for [data-subscribe] forms. Mirrors checkout.js:
// inline status (never window.alert), works for any number of forms on a page.
//
// Markup contract (all inside the <form data-subscribe>):
//   <input type="email" data-email required>
//   <button type="submit">...</button>
//   <p class="subscribe-status" role="status" aria-live="polite"></p>
// Optional: data-source="home" on the form to tag where the signup came from.
// On success the form is replaced by a thank-you note with the free download.
(function () {
  var forms = document.querySelectorAll("[data-subscribe]");
  if (!forms.length) return;

  var CHEATSHEET = "/assets/glp1-muscle-cheatsheet.pdf";

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function wire(form) {
    var input = form.querySelector("[data-email]");
    var btn = form.querySelector('button[type="submit"], button:not([type])');
    var statusEl = form.querySelector(".subscribe-status");
    var source = form.dataset.source || "site";
    var originalLabel = btn ? btn.textContent : "";

    function setStatus(msg, isError) {
      if (!statusEl) return;
      statusEl.innerHTML = isError
        ? '<span class="checkout-err">' + escapeHtml(msg) + "</span>"
        : escapeHtml(msg);
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var email = (input && input.value ? input.value : "").trim();
      if (!email || email.indexOf("@") === -1) {
        setStatus("Please enter a valid email address.", true);
        if (input) input.focus();
        return;
      }
      if (btn) { btn.textContent = "Sending…"; btn.setAttribute("aria-disabled", "true"); }
      setStatus("", false);

      fetch("/.netlify/functions/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, source: source }),
      })
        .then(function (resp) {
          if (!resp.ok) return resp.json().then(function (p) { throw p; });
          return resp.json();
        })
        .then(function () {
          // Replace the form with a thank-you + the free download.
          var thanks = document.createElement("div");
          thanks.className = "subscribe-thanks";
          thanks.innerHTML =
            "<p><strong>You're in.</strong> Your free cheat sheet is ready, and the research digest lands in your inbox.</p>" +
            '<a class="btn btn-primary btn-lg" href="' + CHEATSHEET + '" download>Download the cheat sheet &rarr;</a>';
          form.parentNode.replaceChild(thanks, form);
        })
        .catch(function (err) {
          if (btn) { btn.textContent = originalLabel; btn.setAttribute("aria-disabled", "false"); }
          var msg = (err && err.detail) || "Could not sign you up right now. Please try again.";
          setStatus(msg, true);
        });
    });
  }

  Array.prototype.forEach.call(forms, wire);
})();
