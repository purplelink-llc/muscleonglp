/**
 * Netlify Function — analytics reader/aggregator (MuscleOnGLP), owner-only.
 *
 * GET /.netlify/functions/stats?token=SECRET&days=14
 *
 * Aggregates the per-event records that track.mjs wrote to the `analytics`
 * Blobs store into a JSON summary: pageviews + rough uniques per day, top paths,
 * top referrers, UTM sources, and conversion events (subscribe, checkout_click)
 * broken down by product/meta. The /stats/ dashboard page renders this.
 *
 * Gated by STATS_TOKEN (set it on the Netlify site). Without a matching token
 * the endpoint 401s, so the data is not public.
 *
 * Scale note: this lists+reads one blob per event, which is fine at early-stage
 * volume. If daily events reach the thousands, switch track.mjs to pre-aggregated
 * daily counters (accepting read-modify-write races) or an external sink.
 */

import { getStore } from "@netlify/blobs";

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function bump(obj, key, n = 1) {
  if (!key) return;
  obj[key] = (obj[key] || 0) + n;
}

function topN(obj, n = 15) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ key: k, count: v }));
}

export default async function handler(request) {
  const url = new URL(request.url);
  const expected = Netlify.env.get("STATS_TOKEN");
  if (!expected) {
    return json(500, { error: "misconfigured", detail: "Set STATS_TOKEN on this site." });
  }
  if (url.searchParams.get("token") !== expected) {
    return json(401, { error: "unauthorized" });
  }

  let days = parseInt(url.searchParams.get("days") || "14", 10);
  if (!Number.isFinite(days) || days < 1) days = 14;
  if (days > 90) days = 90;

  const store = getStore("analytics");
  const now = Date.now();
  const summary = {
    rangeDays: days,
    totals: { pageviews: 0, subscribes: 0, checkoutClicks: 0, events: 0 },
    byPath: {},
    byReferrer: {},
    byUtm: {},
    checkoutByProduct: {},
    subscribeBySource: {},
    byDay: {},          // day -> { pageviews, uniques, subscribes, checkoutClicks }
  };
  const uniquesPerDay = {}; // day -> Set(vid)

  for (let i = 0; i < days; i++) {
    const day = new Date(now - i * 86400000).toISOString().slice(0, 10);
    let listing;
    try {
      listing = await store.list({ prefix: `ev/${day}/` });
    } catch (_) {
      continue;
    }
    const blobs = (listing && listing.blobs) || [];
    if (!summary.byDay[day]) summary.byDay[day] = { pageviews: 0, uniques: 0, subscribes: 0, checkoutClicks: 0 };
    if (!uniquesPerDay[day]) uniquesPerDay[day] = new Set();

    for (const b of blobs) {
      let rec;
      try {
        rec = await store.get(b.key, { type: "json" });
      } catch (_) {
        continue;
      }
      if (!rec) continue;
      summary.totals.events++;
      if (rec.vid) uniquesPerDay[day].add(rec.vid);

      if (rec.type === "pageview") {
        summary.totals.pageviews++;
        summary.byDay[day].pageviews++;
        bump(summary.byPath, rec.path);
        if (rec.refHost) bump(summary.byReferrer, rec.refHost);
        if (rec.utm) bump(summary.byUtm, rec.utm);
      } else if (rec.type === "subscribe") {
        summary.totals.subscribes++;
        summary.byDay[day].subscribes++;
        bump(summary.subscribeBySource, rec.meta || rec.path);
      } else if (rec.type === "checkout_click") {
        summary.totals.checkoutClicks++;
        summary.byDay[day].checkoutClicks++;
        bump(summary.checkoutByProduct, rec.meta || "unknown");
      }
    }
    summary.byDay[day].uniques = uniquesPerDay[day].size;
  }

  return json(200, {
    generatedAt: new Date().toISOString(),
    totals: summary.totals,
    topPaths: topN(summary.byPath),
    topReferrers: topN(summary.byReferrer),
    topUtm: topN(summary.byUtm),
    checkoutByProduct: topN(summary.checkoutByProduct),
    subscribeBySource: topN(summary.subscribeBySource),
    byDay: Object.fromEntries(Object.entries(summary.byDay).sort()),
  });
}
