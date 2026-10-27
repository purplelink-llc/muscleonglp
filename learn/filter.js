// Topic filters for the Learn hub. The cards carry 18 different kicker labels,
// too many to offer as buttons, so they are grouped into five topics here.
// A card whose kicker is not in the map shows only under "All". The chosen
// topic is kept in the URL hash (#nutrition), so a filtered list can be linked.
(function () {
  var grid = document.querySelector(".learn-grid");
  if (!grid) return;
  var TOPICS = [
    ["all", "All articles", []],
    ["nutrition", "Nutrition", ["Nutrition", "Supplements"]],
    ["training", "Training", ["Training", "Training & recomposition", "Joints & movement", "Gear"]],
    ["body", "Body composition", ["Body composition", "GLP-1 & muscle", "Comparison", "Older adults", "Women's health", "Type 2 diabetes", "Bone & skeleton"]],
    ["side-effects", "Side effects & maintenance", ["Heart & side effects", "Maintenance"]],
    ["research", "Research & tools", ["Emerging research", "Emerging therapies", "Reference"]]
  ];
  var cards = Array.prototype.slice.call(grid.querySelectorAll(".learn-card"));
  cards.forEach(function (c) {
    var k = c.querySelector(".lc-kicker");
    var label = k ? k.textContent.trim() : "";
    c.dataset.topic = "";
    TOPICS.forEach(function (t) { if (t[2].indexOf(label) >= 0) c.dataset.topic = t[0]; });
  });

  var bar = document.createElement("div");
  bar.className = "learn-filters";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Filter articles by topic");
  var status = document.createElement("p");
  status.className = "learn-count";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  var buttons = TOPICS.map(function (t) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "learn-filter";
    b.dataset.topic = t[0];
    var n = t[0] === "all" ? cards.length : cards.filter(function (c) { return c.dataset.topic === t[0]; }).length;
    b.textContent = t[1] + " (" + n + ")";
    b.addEventListener("click", function () { apply(t[0], true); });
    bar.appendChild(b);
    return b;
  });

  function apply(topic, fromClick) {
    if (!TOPICS.some(function (t) { return t[0] === topic; })) topic = "all";
    var shown = 0;
    cards.forEach(function (c) {
      var on = topic === "all" || c.dataset.topic === topic;
      c.hidden = !on;
      if (on) shown++;
    });
    buttons.forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.topic === topic ? "true" : "false"); });
    status.textContent = topic === "all" ? "Showing all " + shown + " articles." : "Showing " + shown + " of " + cards.length + " articles.";
    if (fromClick) {
      try { history.replaceState(null, "", topic === "all" ? location.pathname : "#" + topic); } catch (e) { /* sandboxed */ }
      if (window.mogTrack) window.mogTrack("learn_filter", topic);
    }
  }

  grid.parentNode.insertBefore(bar, grid);
  grid.parentNode.insertBefore(status, grid);
  apply(location.hash.slice(1) || "all", false);
})();
