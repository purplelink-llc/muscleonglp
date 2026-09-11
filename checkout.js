// Checkout button wiring, mirroring purplelink.llc's paid-tool-landing.js
// pattern: POST to the Netlify checkout function, redirect to the returned
// Stripe Checkout URL.
//
// Supports any number of [data-checkout] buttons on one page (the /guides/
// hub has one per product). Each button pairs with a status element
// (#<data-status>, or the nearest .checkout-status).
//
// Assent is a two-step button, not a checkbox. The first click turns the
// button into "I agree to the Terms & medical disclaimer — continue", and the
// second click is the agreement: it sends accept_terms and the function
// records the acceptance before the buyer can reach a payment page. This
// replaced a required checkbox above the button (2026-09-11): people clicked
// Buy without noticing it, the click did nothing visible, and the button read
// as broken — a click nobody could see was our single biggest funnel leak.
// The agreement text is now ON the thing they click, so nothing is hidden and
// the button always responds. Errors surface inline, never via window.alert().

// Free-gift promo expiry.
//
// The offer is advertised as "Limited time ... through September 30", so it has
// to actually stop being advertised. Left to a human to remember, a dated
// urgency claim rots into a false one; this removes the pre-purchase teaser the
// moment the date passes. Keep PROMO_ENDS in step with lib/products.mjs.
//
// This hides ONLY .bonus-gift (the pitch). It deliberately leaves .bonus-box
// alone: that is the delivery of a gift someone already paid for, and the
// backend keeps honouring bonuses past the date. Over-delivering after the
// cutoff is fine; withdrawing a gift a buyer was shown is not.
(function () {
  var PROMO_ENDS = "2026-09-30";
  var blocks = document.querySelectorAll(".bonus-gift");
  if (!blocks.length) return;
  // Compare against the end of the final day, in the visitor's own timezone.
  var cutoff = new Date(PROMO_ENDS + "T23:59:59");
  if (isNaN(cutoff.getTime()) || Date.now() <= cutoff.getTime()) return;
  Array.prototype.forEach.call(blocks, function (el) {
    el.hidden = true;
  });
})();

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
    var agreed = false;
    var statusEl =
      (btn.dataset.status && document.getElementById(btn.dataset.status)) ||
      (scope && scope.querySelector(".checkout-status"));

    // kind: "error" | "busy" (spinner) | "note" (plain)
    function setStatus(msg, kind) {
      if (!statusEl) return;
      if (kind === "error") {
        statusEl.innerHTML = '<span class="checkout-err">' + escapeHtml(msg) + "</span>";
      } else if (kind === "busy") {
        statusEl.innerHTML = '<span class="checkout-spinner" aria-hidden="true"></span>' + escapeHtml(msg);
      } else {
        statusEl.textContent = msg;
      }
    }

    function setState(label, disabled) {
      btn.textContent = label;
      btn.setAttribute("aria-disabled", disabled ? "true" : "false");
    }

    btn.addEventListener("click", function (event) {
      event.preventDefault();
      if (btn.getAttribute("aria-disabled") === "true") return;

      if (!agreed) {
        // Step one: the click is intent. Count it, then make the next click
        // the agreement itself. (Tracking here rather than after assent is
        // deliberate: the old flow only counted clicks that had also found
        // the checkbox, so the dashboard under-read real buyer intent.)
        agreed = true;
        if (window.mogTrack) window.mogTrack("checkout_click", product);
        setState("I agree to the Terms & medical disclaimer \u2014 continue \u2192", false);
        setStatus("One more click. That button now confirms you accept the Terms of Service and the medical disclaimer.", "note");
        btn.classList.add("btn-agree");
        return;
      }

      if (window.mogTrack) window.mogTrack("checkout_confirm", product);
      setState("Opening checkout…", true);
      setStatus("Opening checkout…", "busy");

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
          agreed = false;
          btn.classList.remove("btn-agree");
          setState(originalLabel, false);
          var msg = (err && err.detail) || "Could not start checkout. Please try again.";
          setStatus(msg, "error");
        });
    });

  }

  Array.prototype.forEach.call(buttons, wire);
})();
