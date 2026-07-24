/**
 * Netlify Function — email capture -> Buttondown (MuscleOnGLP).
 *
 * POST /.netlify/functions/subscribe
 *   body: { email: "you@example.com", source?: "home" | "article:slug" | ... }
 *
 * Subscribes the address to the Buttondown list so we own the audience instead
 * of renting it from social. The free cheat sheet is the incentive; the browser
 * reveals its download link on a 200 (the PDF is a public asset, so there is no
 * gating to do here). Buttondown's own welcome email can also deliver the link.
 *
 * Required env var (per-site):
 *   BUTTONDOWN_API_KEY   From buttondown.email -> Settings -> API. Server-side
 *                        only; never shipped to the browser.
 *
 * Hardening mirrors checkout.mjs: POST-only, a daily per-IP rate limit via
 * Netlify Blobs, and a light email-shape check. An address that is already
 * subscribed is treated as success (idempotent), so re-submitting is harmless.
 */

import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

const BUTTONDOWN_API = "https://api.buttondown.email/v1/subscribers";
const SUBSCRIBE_DAILY_LIMIT = 40;
// Deliberately loose: reject only obvious non-emails, let Buttondown be the
// real validator. Anchored, no catastrophic backtracking.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function rateLimited(clientIp) {
  const day = new Date().toISOString().slice(0, 10);
  const digest = createHash("sha256").update(clientIp).digest("hex").slice(0, 16);
  const key = `rl:subscribe:${day}:${digest}`;
  const store = getStore("rate-limits");
  const raw = await store.get(key);
  const current = raw ? parseInt(raw, 10) || 0 : 0;
  if (current >= SUBSCRIBE_DAILY_LIMIT) return true;
  await store.set(key, String(current + 1));
  return false;
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const clientIp =
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown";

  if (await rateLimited(clientIp)) {
    return jsonResponse(429, { error: "rate_limited", detail: "Too many attempts today. Try again tomorrow." });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    body = {};
  }
  const email = String(body?.email || "").trim().toLowerCase();
  const source = String(body?.source || "site").slice(0, 60);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return jsonResponse(400, { error: "invalid_email", detail: "Please enter a valid email address." });
  }

  const apiKey = Netlify.env.get("BUTTONDOWN_API_KEY");
  if (!apiKey) {
    return jsonResponse(500, { error: "misconfigured", detail: "Set BUTTONDOWN_API_KEY on this site." });
  }

  let resp, data;
  try {
    resp = await fetch(BUTTONDOWN_API, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address: email,
        tags: ["cheat-sheet", source],
        referrer_url: "https://getmuscleonglp.com/",
      }),
    });
    data = await resp.json().catch(() => ({}));
  } catch (err) {
    return jsonResponse(502, { error: "provider_unreachable", detail: String(err) });
  }

  // 200/201 = created. Buttondown returns 400 with an "already subscribed"
  // style code when the address exists; that is a success from the visitor's
  // point of view, so we don't surface it as an error.
  if (resp.ok) {
    return jsonResponse(200, { ok: true, status: "subscribed" });
  }
  const code = (data && (data.code || data.detail || "")) + "";
  if (resp.status === 400 && /exist|already|subscribed|duplicate/i.test(JSON.stringify(data))) {
    return jsonResponse(200, { ok: true, status: "already_subscribed" });
  }

  // Never surface the provider's raw code to a visitor. subscribe.js renders
  // `detail` verbatim, so passing `code` through put strings like
  // "subscriber_blocked" in front of real people, which reads as broken and
  // gives them nothing to act on. Map what we know, stay vague otherwise, and
  // keep the raw code server-side for debugging.
  console.warn("subscribe: provider rejected", { status: resp.status, code });

  let detail = "Something went wrong on our side. Please try again in a moment.";
  if (/blocked|denied|spam/i.test(code)) {
    detail = "We could not accept that address. If it is a work or forwarding address, try a personal one.";
  } else if (/invalid|malformed|format/i.test(code)) {
    detail = "That email address does not look right. Please check it and try again.";
  } else if (/limit|throttl|rate/i.test(code)) {
    detail = "Too many attempts just now. Please try again in a few minutes.";
  }
  return jsonResponse(502, { error: "provider_error", detail });
}
