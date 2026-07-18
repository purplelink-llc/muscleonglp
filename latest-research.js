// Populates [data-latest-research] on the homepage from /research/index.json.
// Progressive enhancement: the container ships with a plain link fallback, so
// if JS or the fetch fails, visitors still reach /research/. The research
// pipeline rewrites index.json each week, so this stays current with no build
// step. Same-origin fetch; CSP connect-src 'self' allows it.
(function () {
  var host = document.querySelector("[data-latest-research]");
  if (!host || !window.fetch) return;

  var MAX = 2;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function tidy(blurb) {
    var t = String(blurb || "").trim();
    if (!t) return "";
    // index.json blurbs are hard-truncated mid-word; trim the dangling
    // fragment and add an ellipsis so the card reads cleanly.
    if (!/[.!?]$/.test(t)) {
      t = t.replace(/\s+\S*$/, "").replace(/[,;:]$/, "") + "…";
    }
    return t;
  }

  fetch("/research/index.json", { credentials: "same-origin" })
    .then(function (r) { if (!r.ok) throw new Error("bad status"); return r.json(); })
    .then(function (items) {
      if (!Array.isArray(items) || !items.length) return;
      var frag = document.createDocumentFragment();
      items.slice(0, MAX).forEach(function (it) {
        if (!it || !it.slug) return;
        var a = document.createElement("a");
        a.className = "lr-card";
        a.href = "/research/" + encodeURIComponent(it.slug) + "/";
        var studies = it.count ? esc(it.count) + (it.count === 1 ? " study" : " studies") : "New studies";
        a.innerHTML =
          '<span class="lr-week">' + esc(it.week_label || it.date || "This week") + " &middot; " + studies + "</span>" +
          "<h3>Weekly research digest</h3>" +
          "<p>" + esc(tidy(it.blurb)) + "</p>" +
          '<span class="lr-more">Read the digest &rarr;</span>';
        frag.appendChild(a);
      });
      if (frag.childNodes.length) {
        host.innerHTML = "";
        host.appendChild(frag);
      }
    })
    .catch(function () { /* keep the fallback link already in the DOM */ });
})();
