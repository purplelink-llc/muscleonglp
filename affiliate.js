/* Amazon Associates auto-tagger for getmuscleonglp.com.
 *
 * ACTIVATE: set TAG below to your approved Amazon Associates tracking id
 * (looks like "muscleonglp-20"), then deploy. Until it is set this file is a
 * no-op — Amazon links still work, they just carry no tag and earn nothing,
 * which is correct before you are approved.
 *
 * What it does once TAG is set: finds every link to an Amazon storefront
 * (amazon.<tld> or amzn.to) and appends ?tag=TAG so the purchase is credited
 * to you, and marks the link rel="sponsored nofollow" (Google + FTC best
 * practice). It never double-tags a link that already has one.
 *
 * NOTE: the visible "affiliate link" disclosure is in the page HTML, not here —
 * disclosure is required whether or not JS runs.
 */
(function () {
  "use strict";
  var TAG = ""; // <-- put your Amazon Associates tag here to go live

  if (!TAG) return;

  function isAmazon(host) {
    return host === "amzn.to" || /(^|\.)amazon\.[a-z.]+$/.test(host);
  }

  function tagLink(a) {
    var href = a.getAttribute("href") || "";
    try {
      var u = new URL(href, window.location.href);
      if (!isAmazon(u.hostname)) return;
      if (!u.searchParams.get("tag")) {
        u.searchParams.set("tag", TAG);
        a.setAttribute("href", u.toString());
      }
      var rel = (a.getAttribute("rel") || "").split(/\s+/);
      ["sponsored", "nofollow", "noopener"].forEach(function (r) {
        if (rel.indexOf(r) === -1) rel.push(r);
      });
      a.setAttribute("rel", rel.join(" ").trim());
    } catch (e) { /* malformed URL — leave it alone */ }
  }

  function run() {
    var links = document.querySelectorAll('a[href*="amazon."], a[href*="amzn.to"]');
    Array.prototype.forEach.call(links, tagLink);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
