/**
 * Netlify Function — gated PDF download.
 *
 * GET /.netlify/functions/download?session_id=cs_live_…
 *
 * This is the ONLY way to obtain a purchased PDF. The files are not part of
 * the deployed site at all: they live in the `guide-files` Netlify Blobs
 * store, so no public URL for them exists. Before streaming one we require
 * that the Stripe Checkout Session:
 *
 *   1. exists on our account,
 *   2. is actually paid, and
 *   3. has a Terms-of-Service acceptance record, written by checkout.mjs
 *      before the buyer was ever shown a payment page.
 *
 * (3) is the point of the exercise. Because the PDFs are unreachable any other
 * way, nobody downloads one without having agreed to the medical disclaimer
 * and limitation of liability first.
 *
 * A session id is a bearer token for the file the buyer paid for. It is not a
 * secret in the credential sense (Stripe puts it in the success_url), but we
 * still send no-store so it is not retained by shared caches.
 */

import { getStore } from "@netlify/blobs";
import { PRODUCTS, TOS_STORE, FILE_STORE, tosKey } from "./lib/products.mjs";

const STRIPE_API = "https://api.stripe.com/v1";

function fail(status, code, detail) {
  return new Response(JSON.stringify({ error: code, detail }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

export default async function handler(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return fail(405, "method_not_allowed");
  }

  const sessionId = new URL(request.url).searchParams.get("session_id") || "";
  // Guard the path we interpolate into the Stripe URL.
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) {
    return fail(400, "bad_session_id", "Missing or malformed session_id.");
  }

  const secretKey = Netlify.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) return fail(500, "misconfigured", "STRIPE_SECRET_KEY not set.");

  let session;
  try {
    const resp = await fetch(`${STRIPE_API}/checkout/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!resp.ok) {
      return fail(403, "session_not_found", "That download link is not valid for this store.");
    }
    session = await resp.json();
  } catch (err) {
    return fail(502, "stripe_unreachable", String(err));
  }

  let acceptance = null;
  try {
    acceptance = await getStore(TOS_STORE).get(tosKey(sessionId), { type: "json" });
  } catch (_) {
    return fail(503, "terms_lookup_failed", "Please try again in a moment.");
  }
  if (!acceptance) {
    return fail(403, "terms_not_accepted",
      "This order has no recorded acceptance of the Terms of Service. Contact ben@purplelink.llc and we will help.");
  }

  if (session.payment_status !== "paid") {
    return fail(403, "not_paid", "This order has not been paid.");
  }

  const key = session.metadata?.product;
  const product = key ? PRODUCTS[key] : null;
  if (!product) {
    return fail(404, "unknown_product", "We could not identify which guide this order is for. Contact ben@purplelink.llc.");
  }

  let bytes;
  try {
    const blob = await getStore(FILE_STORE).get(product.file, { type: "arrayBuffer" });
    if (!blob) throw new Error(`missing blob ${product.file}`);
    bytes = new Uint8Array(blob);
  } catch (err) {
    return fail(500, "file_unavailable", "The file is temporarily unavailable. Contact ben@purplelink.llc.");
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${product.file}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
