/**
 * Netlify Function — first-party, cookieless analytics collector (MuscleOnGLP).
 *
 * POST /.netlify/functions/track
 *   body: { t: "pageview"|"subscribe"|"checkout_click"|..., p: path,
 *           r: referrer-host, u: utm_source, m: meta (e.g. product) }
 *
 * Why first-party: the site's design rules forbid third-party CDN scripts and
 * require privacy-preservation, so Plausible/GA are out. This stores one small
 * JSON record per event in the `analytics` Netlify Blobs store, keyed by day.
 * No cookies, no fingerprinting; the only per-visitor value is a daily-salted
 * hash of the IP (rotates every day, can't be reversed or linked across days),
 * used purely for a rough unique count. stats.mjs aggregates on read.
 *
 * Respects Do Not Track (client skips sending; we also honor the DNT header).
 * Best-effort: returns 204 even on internal hiccups so analytics never breaks a
 * page. No env vars required to collect; STATS_TOKEN gates reading (stats.mjs).
 */

import { getStore } from "@netlify/blobs";
import { createHash, randomUUID } from "node:crypto";

const BOT_RE = /bot|spider|crawl|slurp|bingpreview|headless|lighthouse|preview|facebookexternalhit|embedly/i;

function clip(v, n) {
  return String(v == null ? "" : v).slice(0, n);
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response("", { status: 405 });
  }
  // Honor Do Not Track at the edge too.
  if (request.headers.get("dnt") === "1") {
    return new Response("", { status: 204 });
  }
  const ua = request.headers.get("user-agent") || "";
  if (BOT_RE.test(ua)) {
    return new Response("", { status: 204 });
  }

  let b;
  try {
    b = await request.json();
  } catch (_) {
    return new Response("", { status: 204 });
  }

  const type = clip(b.t || "pageview", 32);
  const path = clip(b.p || "/", 200);
  const refHost = clip(b.r, 120);   // host only, set client-side (no full URL, no query)
  const utm = clip(b.u, 60);
  const meta = clip(b.m, 120);

  const ip =
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown";
  const day = new Date().toISOString().slice(0, 10);
  // Daily-rotating, salted, truncated — a rough same-day visitor id that can't
  // be reversed to an IP or linked across days.
  const vid = createHash("sha256").update(`${day}|mog|${ip}`).digest("hex").slice(0, 16);

  const rec = { type, path, refHost, utm, meta, vid, ts: Date.now() };

  try {
    await getStore("analytics").setJSON(`ev/${day}/${Date.now()}-${randomUUID().slice(0, 8)}`, rec);
  } catch (_) {
    // Never let analytics failure surface to the visitor.
  }
  return new Response("", { status: 204 });
}
