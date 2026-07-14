// First-party, cookieless analytics beacon (MuscleOnGLP).
// Sends a pageview on load and exposes window.mogTrack(type, meta) for events
// (wired from checkout.js -> "checkout_click" and subscribe.js -> "subscribe").
// No cookies, no fingerprinting. Honors Do Not Track. Same-origin only, so no
// CSP change and no third-party load. Fire-and-forget via sendBeacon.
(function () {
  var dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
  if (dnt === "1" || dnt === "yes") return;

  var ENDPOINT = "/.netlify/functions/track";

  function refHost() {
    try {
      if (!document.referrer) return "";
      var u = new URL(document.referrer);
      if (u.host === location.host) return ""; // internal navigation
      return u.host;                            // host only, never the full URL
    } catch (e) { return ""; }
  }

  function utmSource() {
    try { return new URLSearchParams(location.search).get("utm_source") || ""; }
    catch (e) { return ""; }
  }

  function send(payload) {
    try {
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      } else {
        fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          keepalive: true,
        });
      }
    } catch (e) { /* analytics must never break the page */ }
  }

  window.mogTrack = function (type, meta) {
    send({ t: type || "event", p: location.pathname, r: refHost(), u: utmSource(), m: meta || "" });
  };

  // Pageview on load.
  window.mogTrack("pageview");
})();
