/**
 * Netlify Function — Stripe Checkout session creator (MuscleOnGLP).
 *
 * POST /.netlify/functions/checkout
 *   body: { product: "muscleonglp-guide" | "protein-playbook" | ... }
 *
 * Reuses Purplelink's checkout.mjs pattern and the same Stripe account (per
 * the design decision to ship under Purplelink LLC — same legal entity, same
 * Stripe account, no visible brand link) with the same hardening: origin
 * allowlist, per-buyer idempotency key, and a daily per-IP rate limit via
 * Netlify Blobs.
 *
 * Required env vars (set on this site's Netlify deploy, NOT shared with the
 * purplelink.llc site's env — Netlify env vars are per-site):
 *   STRIPE_SECRET_KEY   sk_test_… or sk_live_…, same Stripe account as
 *                       purplelink.llc. Note the Price ids below must be
 *                       created in the SAME mode as this key: a test-mode
 *                       Price with a live key fails with "No such price".
 *   plus one STRIPE_PRICE_* per entry in lib/products.mjs.
 * Optional:
 *   SITE_ORIGIN         Overrides the fallback origin used to build
 *                       success_url/cancel_url. See ALLOWED_ORIGINS.
 *
 * Terms: the caller must send accept_terms=true, which the site collects with
 * a required checkbox next to every buy button. We record the acceptance in
 * Netlify Blobs BEFORE returning a Checkout URL, so a buyer cannot even reach
 * the payment page without having agreed, and download.mjs refuses to serve a
 * PDF unless the record exists.
 *
 * We do not use Stripe's consent_collection[terms_of_service]: it reads the
 * Terms URL from account-wide public details, and this Stripe account also
 * serves purplelink.llc.
 *
 * Fulfillment: this function only creates the Checkout Session and stamps
 * metadata[product] on it. stripe-webhook.mjs reads that metadata to email the
 * buyer a gated download link, and the per-product success page builds the same
 * link from the session_id, so a customer is never stranded if email fails.
 */

import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { PRODUCTS, TERMS_VERSION, TOS_STORE, tosKey } from "./lib/products.mjs";

const STRIPE_API = "https://api.stripe.com/v1";

// success_url/cancel_url are handed back to the browser as part of a real
// Stripe Checkout URL, so Origin must be checked against a fixed allowlist
// rather than trusted verbatim (mirrors purplelink.llc's checkout.mjs).
//
// getmuscleonglp.com is the real custom domain (registered in Netlify DNS). It
// is in the allowlist so a request from it is trusted, but the fallback stays
// on the Netlify URL until SITE_ORIGIN is switched over — so success_url is
// never built from the custom domain before its TLS certificate is live.
const ALLOWED_ORIGINS = new Set([
  "https://getmuscleonglp.com",
  "https://www.getmuscleonglp.com",
  "https://muscleonglp.netlify.app",
]);
const FALLBACK_ORIGIN = "https://muscleonglp.netlify.app";

const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;
const CHECKOUT_DAILY_LIMIT = 25;

async function checkoutRateLimited(clientIp) {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const digest = createHash("sha256").update(clientIp).digest("hex").slice(0, 16);
  const key = `rl:checkout:${day}:${digest}`;
  const store = getStore("rate-limits");
  const raw = await store.get(key);
  const current = raw ? parseInt(raw, 10) || 0 : 0;
  if (current >= CHECKOUT_DAILY_LIMIT) {
    return true;
  }
  await store.set(key, String(current + 1));
  return false;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function formEncode(params) {
  const parts = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
  }
  return parts.join("&");
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const clientIp =
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown";

  if (await checkoutRateLimited(clientIp)) {
    return jsonResponse(429, { error: "rate_limited" });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    body = {};
  }
  const product = (body && body.product) || "muscleonglp-guide";
  const entry = PRODUCTS[product];
  if (!entry) {
    return jsonResponse(400, { error: "unknown_product", detail: product });
  }

  if (body?.accept_terms !== true) {
    return jsonResponse(400, {
      error: "terms_not_accepted",
      detail: "Please accept the Terms of Service and medical disclaimer to continue.",
    });
  }

  const secretKey = Netlify.env.get("STRIPE_SECRET_KEY");
  const priceId = Netlify.env.get(entry.envKey);
  if (!secretKey || !priceId) {
    return jsonResponse(500, {
      error: "misconfigured",
      detail: `Set STRIPE_SECRET_KEY and ${entry.envKey} on this site.`,
    });
  }

  const requestOrigin = request.headers.get("origin");
  const configuredOrigin = Netlify.env.get("SITE_ORIGIN");
  const origin = ALLOWED_ORIGINS.has(requestOrigin)
    ? requestOrigin
    : (configuredOrigin || FALLBACK_ORIGIN).replace(/\/+$/, "");

  const timeBucket = Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS);
  const idempotencyKey = createHash("sha256")
    .update(`${clientIp}:${product}:${timeBucket}`)
    .digest("hex");

  const params = {
    mode: "payment",
    "payment_method_types[0]": "card",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${origin}${entry.successPath}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/`,
    customer_creation: "if_required",
    "metadata[product]": product,
    "metadata[terms_version]": TERMS_VERSION,
  };

  let resp;
  try {
    resp = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": idempotencyKey,
      },
      body: formEncode(params),
    });
  } catch (err) {
    return jsonResponse(502, { error: "stripe_unreachable", detail: String(err) });
  }

  let data;
  try {
    data = await resp.json();
  } catch (_) {
    return jsonResponse(502, { error: "stripe_bad_response" });
  }

  if (!resp.ok) {
    const detail =
      (data && data.error && (data.error.message || data.error.code)) ||
      "Stripe rejected the request.";
    return jsonResponse(502, { error: "stripe_error", detail });
  }

  if (!data.url) {
    return jsonResponse(502, { error: "no_redirect_url" });
  }

  // Persist the agreement BEFORE the buyer can pay. If this write fails we
  // must not hand back the Checkout URL: download.mjs requires the record, so
  // the buyer would pay and then be unable to retrieve the file. The unused
  // session simply expires.
  try {
    await getStore(TOS_STORE).setJSON(tosKey(data.id), {
      sessionId: data.id,
      product,
      termsVersion: TERMS_VERSION,
      acceptedAt: new Date().toISOString(),
      ipHash: createHash("sha256").update(clientIp).digest("hex").slice(0, 32),
      userAgent: (request.headers.get("user-agent") || "").slice(0, 200),
    });
  } catch (err) {
    return jsonResponse(503, {
      error: "terms_record_failed",
      detail: "We could not record your agreement to the Terms. Please try again.",
    });
  }

  return jsonResponse(200, { url: data.url, id: data.id, product });
}
