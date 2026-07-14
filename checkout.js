// Checkout button wiring, mirroring purplelink.llc's paid-tool-landing.js
// pattern: POST to the Netlify checkout function, redirect to the returned
// Stripe Checkout URL.
//
// Supports any number of [data-checkout] buttons on one page (the /guides/
// hub has one per product). Each button pairs with:
//   - a required [data-terms] checkbox in the same container, and
//   - a status element (#<data-status>, or the nearest .checkout-status).
//
// The checkbox is the clickwrap: the function refuses to create a Checkout
// Session without accept_terms, and records the agreement before the buyer can
// reach a payment page. Errors surface inline rather than through a blocking
// window.alert(), which used to freeze the page until dismissed.
(function () {
  var buttons = document.querySelectorAll("[data-checkout]");
  if (!buttons.length) return;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function wire(btn) {
    var product = btn.dataset.product || "muscleonglp-guide";
    var originalLabel = btn.textContent;
    var scope = btn.parentNode;
    var terms = scope && scope.querySelector("[data-terms]");
    var statusEl =
      (btn.dataset.status && document.getElementById(btn.dataset.status)) ||
      (scope && scope.querySelector(".checkout-status"));

    function setStatus(msg, isError) {
      if (!statusEl) return;
      statusEl.innerHTML = isError
        ? '<span class="checkout-err">' + escapeHtml(msg) + "</span>"
        : '<span class="checkout-spinner" aria-hidden="true"></span>' + escapeHtml(msg);
    }

    function setState(label, disabled) {
      btn.textContent = label;
      btn.setAttribute("aria-disabled", disabled ? "true" : "false");
    }

    btn.addEventListener("click", function (event) {
      event.preventDefault();
      if (btn.getAttribute("aria-disabled") === "true") return;

      if (!terms || !terms.checked) {
        setStatus("Please accept the Terms of Service to continue.", true);
        if (terms) terms.focus();
        return;
      }

      if (window.mogTrack) window.mogTrack("checkout_click", product);
      setState("Opening checkout…", true);
      setStatus("Opening checkout…", false);

      fetch("/.netlify/functions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: product, accept_terms: true }),
      })
        .then(function (resp) {
          if (!resp.ok) return resp.json().then(function (p) { throw p; });
          return resp.json();
        })
        .then(function (data) {
          if (!data || !data.url) throw { detail: "Checkout did not return a redirect URL." };
          window.location.assign(data.url);
        })
        .catch(function (err) {
          setState(originalLabel, false);
          var msg = (err && err.detail) || "Could not start checkout. Please try again.";
          setStatus(msg, true);
        });
    });

    // Clear a stale "please accept the terms" message once they do.
    if (terms) {
      terms.addEventListener("change", function () {
        if (terms.checked && statusEl) statusEl.innerHTML = "";
      });
    }
  }

  Array.prototype.forEach.call(buttons, wire);
})();
