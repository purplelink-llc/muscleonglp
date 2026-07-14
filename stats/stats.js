// Owner dashboard logic for /stats/. External file because the site CSP is
// script-src 'self' (no inline scripts). Fetches the token-gated stats endpoint
// and renders the aggregates. The token is entered each visit and never stored.
(function () {
  var form = document.getElementById("tokform");
  var msg = document.getElementById("msg");
  var out = document.getElementById("out");

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function table(title, rows, headers) {
    if (!rows || !rows.length) return "<h3>" + esc(title) + "</h3><p>No data yet.</p>";
    var h = "<h3>" + esc(title) + "</h3><div class='stats-scroll'><table class='stats-table'><thead><tr>" +
      headers.map(function (x) { return "<th>" + esc(x) + "</th>"; }).join("") + "</tr></thead><tbody>";
    h += rows.map(function (r) {
      return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>";
    }).join("");
    return h + "</tbody></table></div>";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var tok = document.getElementById("tok").value.trim();
    var days = document.getElementById("days").value;
    if (!tok) { msg.textContent = "Enter the token."; return; }
    msg.textContent = "Loading…"; out.innerHTML = "";
    fetch("/.netlify/functions/stats?days=" + encodeURIComponent(days) + "&token=" + encodeURIComponent(tok))
      .then(function (r) { if (!r.ok) return r.json().then(function (p) { throw p; }); return r.json(); })
      .then(function (d) {
        msg.textContent = "";
        var t = d.totals || {};
        var cvr = t.pageviews ? ((t.subscribes || 0) / t.pageviews * 100).toFixed(1) : "0.0";
        var html = "<div class='stats-cards'>";
        html += "<div class='stats-card'><span class='n'>" + (t.pageviews || 0) + "</span><span>pageviews</span></div>";
        html += "<div class='stats-card'><span class='n'>" + (t.subscribes || 0) + "</span><span>signups</span></div>";
        html += "<div class='stats-card'><span class='n'>" + (t.checkoutClicks || 0) + "</span><span>checkout clicks</span></div>";
        html += "<div class='stats-card'><span class='n'>" + cvr + "%</span><span>signup rate</span></div>";
        html += "</div>";
        var byDay = Object.keys(d.byDay || {}).sort().reverse().map(function (day) {
          var v = d.byDay[day];
          return [day, v.pageviews, v.uniques, v.subscribes, v.checkoutClicks];
        });
        html += table("By day", byDay, ["Day", "Views", "Uniques", "Signups", "Checkout clicks"]);
        html += table("Top pages", (d.topPaths || []).map(function (x) { return [x.key, x.count]; }), ["Path", "Views"]);
        html += table("Top referrers (channel)", (d.topReferrers || []).map(function (x) { return [x.key, x.count]; }), ["Referrer host", "Views"]);
        html += table("UTM sources", (d.topUtm || []).map(function (x) { return [x.key, x.count]; }), ["utm_source", "Views"]);
        html += table("Checkout clicks by product", (d.checkoutByProduct || []).map(function (x) { return [x.key, x.count]; }), ["Product", "Clicks"]);
        html += table("Signups by source", (d.subscribeBySource || []).map(function (x) { return [x.key, x.count]; }), ["Source", "Signups"]);
        html += "<p class='guarantee' style='text-align:left;margin-top:24px'>Generated " + esc(d.generatedAt || "") + "</p>";
        out.innerHTML = html;
      })
      .catch(function (err) {
        msg.innerHTML = "<span class='checkout-err'>" + esc((err && (err.error || err.detail)) || "Failed to load.") + "</span>";
      });
  });
})();
