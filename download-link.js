// Success-page download button.
//
// The PDFs are not served from the CDN. The only way to fetch one is the
// download function, which re-checks that the Stripe session is paid and that
// the buyer accepted the Terms of Service at checkout. Stripe hands us the
// session id back on success_url, so we build the link from it here.
(function () {
  var link = document.querySelector("[data-download]");
  if (!link) return;
  var note = document.getElementById("dl-note");

  var bonusLink = document.querySelector("[data-bonus-download]");

  var sessionId = new URLSearchParams(window.location.search).get("session_id");
  if (!sessionId || !/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) {
    link.setAttribute("aria-disabled", "true");
    link.removeAttribute("href");
    link.textContent = "Download link unavailable";
    if (note) {
      note.textContent =
        "We could not read your order reference from this page. Use the download link in the email we just sent you, or contact ben@purplelink.llc and we will resend it.";
    }
    if (bonusLink) {
      bonusLink.setAttribute("aria-disabled", "true");
      bonusLink.removeAttribute("href");
    }
    return;
  }

  link.href = "/.netlify/functions/download?session_id=" + encodeURIComponent(sessionId);

  // Bonus link, present only on success pages for products that ship one
  // (see lib/products.mjs `bonus`). Same session id, same gating — the
  // endpoint just streams a different file for &bonus=1.
  if (bonusLink) {
    bonusLink.href =
      "/.netlify/functions/download?session_id=" + encodeURIComponent(sessionId) + "&bonus=1";
  }
})();
