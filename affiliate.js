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
  var TAG = "purplelinkpl-20"; // <-- put your Amazon Associates tag here to go live

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

  // --- Product cards -----------------------------------------------------
  // Turns each .gear-list (plain <li><a>Product</a> why...</li> rows, which stay
  // the no-JS fallback) into visual cards: a drawn illustration, the product,
  // the reason, and a "Check today's price" button. The illustrations are our
  // own line art: Amazon's Operating Agreement forbids copying its product
  // images or showing a price that is not pulled live from its API, so no
  // photo and no hard-coded price appear here.
  var P = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  var ICONS = {
    tub: '<rect x="12" y="16" width="24" height="26" rx="4" ' + P + '/><rect x="10" y="8" width="28" height="8" rx="2" ' + P + '/><path d="M18 26h12M18 31h8" ' + P + '/>',
    shaker: '<path d="M16 14h16l-2 28H18z" ' + P + '/><rect x="15" y="7" width="18" height="7" rx="2" ' + P + '/><path d="M19 24h10" ' + P + '/>',
    carton: '<path d="M16 16l4-8h8l4 8v26H16z" ' + P + '/><path d="M16 16h16M20 28h8" ' + P + '/>',
    packet: '<path d="M13 10h22v28l-11 4-11-4z" ' + P + '/><path d="M13 16h22M19 26h10" ' + P + '/>',
    jar: '<rect x="13" y="17" width="22" height="24" rx="5" ' + P + '/><rect x="15" y="9" width="18" height="8" rx="2" ' + P + '/><path d="M30 28l7-7" ' + P + '/><circle cx="38" cy="20" r="2.5" ' + P + '/>',
    capsules: '<rect x="8" y="20" width="18" height="8" rx="4" transform="rotate(-30 17 24)" ' + P + '/><rect x="22" y="22" width="18" height="8" rx="4" transform="rotate(20 31 26)" ' + P + '/>',
    bottle: '<rect x="15" y="15" width="18" height="26" rx="4" ' + P + '/><rect x="17" y="8" width="14" height="7" rx="1.5" ' + P + '/><path d="M15 24h18M15 33h18" ' + P + '/>',
    bands: '<path d="M10 30c0-8 6-14 14-14s14 6 14 14" ' + P + '/><path d="M14 34c0-6 4-10 10-10s10 4 10 10" ' + P + '/><rect x="6" y="30" width="8" height="10" rx="2" ' + P + '/><rect x="34" y="30" width="8" height="10" rx="2" ' + P + '/>',
    dumbbell: '<path d="M16 24h16" ' + P + '/><rect x="8" y="16" width="8" height="16" rx="2" ' + P + '/><rect x="32" y="16" width="8" height="16" rx="2" ' + P + '/><path d="M5 20v8M43 20v8" ' + P + '/>',
    scale: '<rect x="9" y="22" width="30" height="16" rx="3" ' + P + '/><path d="M13 22c0-6 5-10 11-10s11 4 11 10" ' + P + '/><rect x="19" y="27" width="10" height="6" rx="1" ' + P + '/>',
    shoe: '<path d="M7 33h34v4H7zM7 33l2-12h8l4 5h10c6 0 10 3 10 7" ' + P + '/>',
    bowl: '<path d="M8 22h32c0 10-7 17-16 17S8 32 8 22z" ' + P + '/><path d="M16 16c2-3 4-3 6 0s4 3 6 0 4-3 6 0" ' + P + '/>',
    mat: '<circle cx="34" cy="20" r="8" ' + P + '/><circle cx="34" cy="20" r="3.5" ' + P + '/><path d="M34 28H8v8h28" ' + P + '/><path d="M42 20v12c0 2-2 4-6 4" ' + P + '/>'
  };
  // First match wins, so the specific words come before the general ones.
  var KINDS = [
    [/shaker|water bottle/, "shaker"], [/ready-to-drink|rtd|shakes\b/, "carton"], [/packet|single-serve/, "packet"],
    [/capsule/, "capsules"], [/creatine/, "jar"], [/scale/, "scale"], [/band/, "bands"],
    [/dumbbell|kettlebell|weight/, "dumbbell"], [/shoe/, "shoe"], [/pasta|lentil|chickpea/, "bowl"], [/\bmat\b/, "mat"],
    [/vitamin|b12|iron|calcium|magnesium|omega|supplement/, "bottle"], [/protein|whey|casein|powder/, "tub"]
  ];
  function kindOf(text) {
    var t = text.toLowerCase();
    for (var i = 0; i < KINDS.length; i++) { if (KINDS[i][0].test(t)) return KINDS[i][1]; }
    return "tub";
  }

  function cardify(list) {
    var cards = document.createElement("div");
    cards.className = "gear-cards";
    Array.prototype.forEach.call(list.children, function (li) {
      var a = li.querySelector("a");
      if (!a) return;
      var name = a.textContent.replace(/^(a|an|the)\s+/i, "");
      name = name.charAt(0).toUpperCase() + name.slice(1);
      var why = li.textContent.replace(a.textContent, "").replace(/^[\s,.:;]+/, "").trim();
      var card = document.createElement("a");
      card.className = "gear-card";
      card.href = a.href;
      card.target = "_blank";
      card.rel = "sponsored nofollow noopener";
      card.innerHTML =
        '<span class="gear-card-art" aria-hidden="true"><svg viewBox="0 0 48 48" width="56" height="56">' + ICONS[kindOf(a.textContent)] + "</svg></span>" +
        '<span class="gear-card-body"><span class="gear-card-name"></span><span class="gear-card-why"></span>' +
        '<span class="gear-card-cta">Check today’s price on Amazon →</span></span>';
      card.querySelector(".gear-card-name").textContent = name;
      // A row that continued the product's sentence ("<a>Whey</a> is one way...")
      // leaves a lowercase verb; give it a subject instead of capitalizing it.
      // Singular verbs end in "s" (is, has, makes); plural products (bands, packets) do not (cover, are).
      why = why.replace(/^\([^)]*\)\s*/, "");
      var verb = (why.match(/^[a-z]+/) || [""])[0];
      card.querySelector(".gear-card-why").textContent =
        verb && !/^(the|a|an|for|one|any|three|five)$/.test(verb)
          ? (/s$/.test(verb) ? "It " : "They ") + why
          : why.charAt(0).toUpperCase() + why.slice(1);
      cards.appendChild(card);
      if (window.mogTrack) {
        card.addEventListener("click", function () { window.mogTrack("affiliate_click", kindOf(a.textContent) + ":" + name.slice(0, 40)); });
      }
    });
    if (cards.children.length) { list.parentNode.replaceChild(cards, list); }
  }

  function run() {
    Array.prototype.forEach.call(document.querySelectorAll(".gear-list"), cardify);
    var links = document.querySelectorAll('a[href*="amazon."], a[href*="amzn.to"]');
    Array.prototype.forEach.call(links, tagLink);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
