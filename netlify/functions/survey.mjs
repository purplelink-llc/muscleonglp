/**
 * Netlify Function — GLP-1 muscle survey collector (MuscleOnGLP).
 *
 * POST /.netlify/functions/survey
 *   body: { med, duration, training, tracks, grams, clinician, stopping,
 *           strength, hp (honeypot) }
 *
 * Purpose: gather our own numbers on what GLP-1 users actually DO about muscle
 * (protein, resistance training, whether a clinician ever raised it). Published
 * as an aggregate with methodology and limitations; it is the site's only piece
 * of original data, so the collection has to be clean enough to defend.
 *
 * Privacy posture, deliberately strict for health-adjacent data:
 *   - EVERY field is a fixed option validated against an allowlist. There is no
 *     free-text input anywhere, so a respondent cannot type a name, a dose, or
 *     a medical detail even if they want to.
 *   - No email, no name, no PII is collected. Nothing here identifies a person.
 *   - The raw IP is never stored. As in track.mjs we keep only a daily-salted,
 *     truncated SHA-256 of it, used to limit one response per person per day
 *     and for nothing else. It cannot be reversed or linked across days.
 *
 * Hardening mirrors subscribe.mjs: POST-only, per-IP daily rate limit via
 * Netlify Blobs, a honeypot field, a bot user-agent check, and a hard cap on
 * body size. Reading the results is gated separately (survey-results.mjs).
 */

import { createHash, randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";

const BOT_RE = /bot|spider|crawl|slurp|bingpreview|headless|lighthouse|preview|facebookexternalhit|embedly/i;
const DAILY_LIMIT = 5;      // generous for shared IPs, tight enough to stop flooding
const MAX_BODY = 2000;      // bytes; the payload is 8 short enums

// The single source of truth for what a valid answer is. Keep in sync with the
// radio values in survey/index.html.
const ALLOWED = {
  med:       ["semaglutide", "tirzepatide", "other-glp1", "not-taking"],
  duration:  ["lt3", "3to6", "6to12", "gt12", "na"],
  training:  ["never", "1to2", "3plus"],
  tracks:    ["no", "roughly", "to-target"],
  grams:     ["lt60", "60to90", "90to120", "120plus", "dont-know"],
  clinician: ["unprompted", "i-asked", "no"],
  stopping:  ["stopped", "within-year", "no-plan", "unsure"],
  strength:  ["weaker", "no-change", "stronger", "not-tracked", "na"],
};
const REQUIRED = ["med", "duration", "training", "tracks", "clinician", "stopping"];

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function rateLimited(clientIp) {
  const day = new Date().toISOString().slice(0, 10);
  const digest = createHash("sha256").update(clientIp).digest("hex").slice(0, 16);
  const key = `rl:survey:${day}:${digest}`;
  const store = getStore("rate-limits");
  const raw = await store.get(key);
  const current = raw ? parseInt(raw, 10) || 0 : 0;
  if (current >= DAILY_LIMIT) return true;
  await store.set(key, String(current + 1));
  return false;
}

export default async function handler(request) {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });

  const ua = request.headers.get("user-agent") || "";
  if (BOT_RE.test(ua)) return json(204, {});

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { error: "too_large" });

  let b;
  try {
    b = JSON.parse(raw);
  } catch (_) {
    return json(400, { error: "bad_request", detail: "Could not read that submission." });
  }

  // Honeypot: a real person never fills a field they cannot see.
  if (b.hp) return json(200, { ok: true });

  // Validate strictly. Anything not on the allowlist is rejected outright
  // rather than coerced, so the stored data needs no cleaning later.
  const answers = {};
  for (const [field, options] of Object.entries(ALLOWED)) {
    const v = b[field];
    if (v == null || v === "") {
      if (REQUIRED.includes(field)) {
        return json(400, { error: "incomplete", detail: "Please answer every required question." });
      }
      continue;
    }
    if (typeof v !== "string" || !options.includes(v)) {
      return json(400, { error: "invalid", detail: "That submission could not be read. Please reload and try again." });
    }
    answers[field] = v;
  }

  const ip =
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown";

  try {
    if (await rateLimited(ip)) {
      return json(429, { error: "rate_limited", detail: "You have already submitted today. Thank you." });
    }
  } catch (_) {
    // A rate-limit backend hiccup should not block a legitimate response.
  }

  const day = new Date().toISOString().slice(0, 10);
  // Same construction as track.mjs: daily-salted, truncated, irreversible.
  const vid = createHash("sha256").update(`${day}|mog-survey|${ip}`).digest("hex").slice(0, 16);

  const record = { ...answers, vid, day, ts: Date.now() };

  try {
    await getStore("survey").setJSON(`resp/${day}/${Date.now()}-${randomUUID().slice(0, 8)}`, record);
  } catch (_) {
    return json(500, { error: "store_failed", detail: "We could not record that. Please try again shortly." });
  }

  return json(200, { ok: true });
}
