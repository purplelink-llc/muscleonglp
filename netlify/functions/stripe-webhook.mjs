/**
 * Netlify Function — MuscleOnGLP Stripe webhook receiver (email fulfillment).
 *
 * POST /.netlify/functions/stripe-webhook
 *
 * Stripe POSTs `checkout.session.completed` here when a payment succeeds.
 * We verify the Stripe signature, pull the buyer's email and the purchased
 * product out of the session, and email them a download link for the file
 * they actually bought (via Resend, same account and verified sending domain
 * as purplelink.llc's transactional email). A copy goes to ben@purplelink.llc
 * so every sale is visible without needing a dashboard.
 *
 * Which file to send is decided by `session.metadata.product`, resolved
 * against the shared registry in lib/products.mjs. If a session arrives with a
 * product we don't recognise, or without recorded terms-of-service consent, we
 * deliberately do NOT guess: the buyer gets a "a human is on it" email and the
 * operator gets a loud one.
 *
 * We email a gated download link (download.mjs), never the file's raw path.
 * The PDFs are not served from the CDN at all, so the link is the only way in
 * and it re-checks payment and consent on every request.
 *
 * Required env vars (per-site, not shared with the purplelink.llc site):
 *   STRIPE_WEBHOOK_SECRET  whsec_… signing secret for THIS site's endpoint
 *   RESEND_API_KEY         Resend key with sending access
 * Optional:
 *   SITE_ORIGIN            Public origin used to build download links.
 *                          Defaults to the Netlify URL. Set to
 *                          https://getmuscleonglp.com once that custom domain's
 *                          TLS certificate has provisioned on this site.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { PRODUCTS, TERMS_VERSION, TOS_STORE, tosKey, downloadUrl } from "./lib/products.mjs";

const RESEND_API_URL = "https://api.resend.com/emails";
// Resend verifies domains exactly: `purplelink.llc` is verified, the
// `mail.purplelink.llc` subdomain is NOT (Resend treats a subdomain as a
// separate domain that must be added and verified on its own). Sending from
// the subdomain returns HTTP 403 "domain is not verified", which would mean a
// paying customer never receives their download link. Only use an address on
// a domain that is actually verified in the Resend dashboard.
const FROM_ADDRESS = "MuscleOnGLP <guides@purplelink.llc>";
const OPERATOR_EMAIL = "ben@purplelink.llc";
const SUPPORT_EMAIL = "ben@purplelink.llc";

const MAX_SIG_AGE_SECONDS = 5 * 60; // reject replays older than 5 min

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Verify a Stripe signature header against the raw body. Identical logic to
 * purplelink.llc's stripe-webhook.mjs (see that file's docstring for the
 * signature-format explanation).
 */
function verifyStripeSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim());
  let timestamp = null;
  const candidates = [];
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k === "t") timestamp = v;
    if (k === "v1") candidates.push(v);
  }
  if (!timestamp || candidates.length === 0) return false;

  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - ts;
  if (ageSeconds > MAX_SIG_AGE_SECONDS) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");

  for (const sig of candidates) {
    const sigBuf = Buffer.from(sig, "utf8");
    if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}

async function sendEmail({ to, subject, html, text }) {
  const apiKey = Netlify.env.get("RESEND_API_KEY");
  if (!apiKey) return { status: "skipped", reason: "no_api_key" };

  try {
    const resp = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      // from is on the verified apex (guides@purplelink.llc), which is a
      // send-only alias; point replies at a monitored inbox so "reply to this
      // email" in the receipt actually reaches a human.
      body: JSON.stringify({ from: FROM_ADDRESS, to: [to], reply_to: SUPPORT_EMAIL, subject, html, text }),
    });
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => "");
      return { status: "error", reason: `resend_http_${resp.status}`, detail: bodyText };
    }
    return { status: "ok" };
  } catch (err) {
    return { status: "error", reason: "resend_unreachable", detail: String(err) };
  }
}

function downloadEmailHtml(title, url) {
  return `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#1b2420">
  <h2 style="color:#2f6f5e">Thanks for your purchase</h2>
  <p>Your guide, <strong>${title}</strong>, is ready to download.</p>
  <p style="margin:28px 0">
    <a href="${url}" style="background:#2f6f5e;color:#fff;padding:14px 28px;border-radius:100px;text-decoration:none;font-weight:600">Download the PDF</a>
  </p>
  <p style="font-size:14px;color:#45524c">If the button doesn't work, copy this link into your browser: ${url}</p>
  <p style="font-size:13px;color:#8a9993;margin-top:32px">This guide is educational and does not constitute medical advice. Consult your prescribing clinician before beginning a new exercise or nutrition program.</p>
  <p style="font-size:13px;color:#8a9993">Trouble downloading? Reply to this email and we'll help.</p>
</div>`;
}

function fallbackEmailHtml() {
  return `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#1b2420">
  <h2 style="color:#2f6f5e">Thanks for your purchase</h2>
  <p>Your payment went through. We hit a snag identifying which guide to send you automatically, so a human is picking this up now and will email your download link shortly.</p>
  <p style="font-size:14px;color:#45524c">If you don't hear from us within one business day, reply to this email or write to ${SUPPORT_EMAIL} and we'll sort it out immediately.</p>
</div>`;
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const webhookSecret = Netlify.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    return jsonResponse(500, { error: "misconfigured", detail: "STRIPE_WEBHOOK_SECRET not set." });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
    return jsonResponse(400, { error: "invalid_signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (_) {
    return jsonResponse(400, { error: "invalid_json" });
  }

  if (event.type !== "checkout.session.completed") {
    // Acknowledge anything we're not subscribed to act on so Stripe stops retrying it.
    return jsonResponse(200, { received: true, ignored: event.type });
  }

  const session = event.data?.object || {};
  const buyerEmail =
    session.customer_details?.email || session.customer_email || null;
  const product = session.metadata?.product || null;

  if (!buyerEmail) {
    // Nothing we can do without an email address; acknowledge so Stripe
    // doesn't retry forever, but this is worth noticing in the Stripe
    // dashboard's webhook logs.
    return jsonResponse(200, { received: true, warning: "no_buyer_email" });
  }

  const entry = product ? PRODUCTS[product] : null;

  // Unknown or absent product: never guess which file to send. Tell the buyer
  // a human is on it, and make sure the operator actually is.
  if (!entry) {
    const buyerResult = await sendEmail({
      to: buyerEmail,
      subject: "Your MuscleOnGLP purchase",
      html: fallbackEmailHtml(),
      text: `Thanks for your purchase. We hit a snag identifying which guide to send automatically; a human will email your download link shortly. Questions: ${SUPPORT_EMAIL}`,
    });
    try {
      await sendEmail({
        to: OPERATOR_EMAIL,
        subject: `[MuscleOnGLP] ACTION NEEDED: unknown product "${product || "(none)"}"`,
        text: `A checkout completed with a product key we do not recognise.\nBuyer: ${buyerEmail}\nproduct metadata: ${product || "(none)"}\nSession: ${session.id || "unknown"}\nAmount: ${session.amount_total ?? "unknown"} ${session.currency || ""}\nBuyer notification send status: ${buyerResult.status}\n\nSend this buyer their file manually, then reconcile the product key against lib/products.mjs.`,
      });
    } catch (_) {
      // Swallow — operator notification is best-effort.
    }
    // 200: retrying will not make the metadata appear.
    return jsonResponse(200, { received: true, warning: "unknown_product", product });
  }

  // checkout.mjs records the agreement before the buyer reaches Stripe, so a
  // missing record should be unreachable. If it ever happens, download.mjs
  // would refuse the file anyway, so mailing a link would strand the buyer on
  // a 403. Hand it to a human instead.
  let acceptance = null;
  try {
    acceptance = await getStore(TOS_STORE).get(tosKey(session.id), { type: "json" });
  } catch (_) {
    // Treat a lookup failure as "no record": the same human-handled path.
  }

  if (!acceptance) {
    const buyerResult = await sendEmail({
      to: buyerEmail,
      subject: "Your MuscleOnGLP purchase",
      html: fallbackEmailHtml(),
      text: `Thanks for your purchase. We need to finish one step before your download link works; a human will email it to you shortly. Questions: ${SUPPORT_EMAIL}`,
    });
    try {
      await sendEmail({
        to: OPERATOR_EMAIL,
        subject: `[MuscleOnGLP] ACTION NEEDED: no terms record on ${session.id || "unknown"}`,
        text: `A checkout completed with NO recorded terms-of-service acceptance.\nBuyer: ${buyerEmail}\nProduct: ${product}\nSession: ${session.id || "unknown"}\nBuyer notification send status: ${buyerResult.status}\n\ndownload.mjs will refuse to serve this file. Check that checkout.mjs still writes the acceptance record to the "${TOS_STORE}" blob store before returning a Checkout URL.`,
      });
    } catch (_) {
      // Swallow — operator notification is best-effort.
    }
    return jsonResponse(200, { received: true, warning: "no_terms_record", product });
  }

  const link = downloadUrl(session.id);

  const customerResult = await sendEmail({
    to: buyerEmail,
    subject: `Your guide: ${entry.title}`,
    html: downloadEmailHtml(entry.title, link),
    text: `Thanks for your purchase. Download ${entry.title} here: ${link}`,
  });

  // Best-effort sale notification — never let a failure here affect the
  // response Stripe sees (that controls its retry behavior for the
  // customer-facing send above, which is the send that actually matters).
  try {
    await sendEmail({
      to: OPERATOR_EMAIL,
      subject: `[MuscleOnGLP] Sale: ${entry.title} to ${buyerEmail}`,
      text: `New sale.\nProduct: ${product} (${entry.title})\nBuyer: ${buyerEmail}\nSession: ${session.id || "unknown"}\nAmount: ${session.amount_total ?? "unknown"} ${session.currency || ""}\nDownload link sent: ${link}\n\n--- Terms of Service acceptance ---\nAccepted: yes\nVersion: ${acceptance.termsVersion || TERMS_VERSION}\nAccepted at: ${acceptance.acceptedAt}\nIP (sha256, truncated): ${acceptance.ipHash}\nUser agent: ${acceptance.userAgent || "(none)"}\nTerms: ${"https://getmuscleonglp.com/terms/"}\nCustomer email send status: ${customerResult.status}${customerResult.detail ? ` (${customerResult.detail})` : ""}`,
      html: undefined,
    });
  } catch (_) {
    // Swallow — operator notification is best-effort.
  }

  if (customerResult.status === "error") {
    // Let Stripe retry — the customer hasn't gotten their file yet.
    return jsonResponse(502, { error: "email_send_failed", detail: customerResult });
  }

  return jsonResponse(200, { received: true, emailed: buyerEmail, product });
}
