/**
 * Single source of truth for the purchasable products.
 *
 * Imported by checkout.mjs (which Price to charge, where to send the buyer),
 * stripe-webhook.mjs (which file to email), and download.mjs (which file to
 * stream). Keeping one map means the three can never drift apart, which is
 * how a buyer ends up paying for one guide and receiving another.
 *
 * `file` is the key of the PDF in the `guide-files` Netlify Blobs store. The
 * PDFs are NOT part of the deployed site, so there is no public URL for them
 * at all. Upload with:
 *   netlify blobs:set guide-files <file> --input private/<file>
 *
 * `bonus`, where present, is another key in this same map: the free gift that
 * ships with this product (2026-09-10 promo). It rides the existing
 * single-file plumbing rather than new multi-file fulfillment — download.mjs
 * streams `PRODUCTS[bonus].file` instead of the main file when the request
 * carries `&bonus=1`, so a bonus is just a second link to the same endpoint.
 * Omit `bonus` for a product that shouldn't offer one (Complete Pack already
 * contains everything else here, so it gets none).
 *
 * This lives in lib/ rather than beside the functions because every top-level
 * file in the functions directory is deployed as its own endpoint.
 */
export const PRODUCTS = {
  "muscleonglp-guide": {
    envKey: "STRIPE_PRICE_MUSCLEONGLP_GUIDE",
    successPath: "/success/",
    title: "Preserving Lean Mass on GLP-1 Therapy",
    file: "preserving-lean-mass-on-glp1.pdf",
    bonus: "creatine-glp1",
  },
  // The Complete Pack: the main guide + all four companion guides merged into
  // one 60-page PDF. A distinct product with its own Stripe Price and its own
  // merged file, so it rides the exact same single-file download/webhook path
  // as every other product (no multi-file fulfillment code). This is the
  // headline "best value" tier — it lifts the typical order from the $5 main
  // guide to the pack. Its bonus has to be something NOT already inside it:
  // Creatine (every other product's gift) is one of its own five guides, so
  // the pack gets the monthly research review instead. Without a bonus the
  // pack was strictly worse than buying à la carte under this promo, which
  // made the "best value" badge false.
  "complete-pack": {
    envKey: "STRIPE_PRICE_COMPLETE_PACK",
    successPath: "/success/complete-pack/",
    title: "The Complete GLP-1 Muscle Pack",
    file: "complete-pack.pdf",
    bonus: "research-review-2026-08",
  },
  // The Protein Playbook is the email lead magnet (2026-09-11): free to
  // anyone who subscribes, delivered through a signed link (see MAGNET_PRODUCT
  // below). It is no longer sold on its own or used as a purchase bonus — a
  // "free gift" a visitor can get free anyway is not a gift. The entry stays
  // because download.mjs needs its file key, and because one real order for
  // it exists (2026-08-31) whose link must keep working.
  "protein-playbook": {
    envKey: "STRIPE_PRICE_PROTEIN_PLAYBOOK",
    successPath: "/success/protein-playbook/",
    title: "The Protein Playbook",
    file: "protein-playbook.pdf",
    bonus: "creatine-glp1",
  },
  "creatine-glp1": {
    envKey: "STRIPE_PRICE_CREATINE_GLP1",
    successPath: "/success/creatine-glp1/",
    title: "Creatine on a GLP-1",
    file: "creatine-on-glp1.pdf",
    // Can't gift itself, so this is the one product with a different bonus.
    bonus: "no-gym-plan",
  },
  "no-gym-plan": {
    envKey: "STRIPE_PRICE_NO_GYM_PLAN",
    successPath: "/success/no-gym-plan/",
    title: "The No-Gym Plan",
    file: "no-gym-plan.pdf",
    bonus: "creatine-glp1",
  },
  "off-ramp": {
    envKey: "STRIPE_PRICE_OFF_RAMP",
    successPath: "/success/off-ramp/",
    title: "The GLP-1 Off-Ramp",
    file: "glp1-off-ramp.pdf",
    bonus: "creatine-glp1",
  },
  // The "template tier" ($12-$19): printable/guided PDFs that fill the gap
  // between the $9 Complete Pack and nothing above it. Same single-file
  // download/webhook path as every other product.
  "tracker": {
    envKey: "STRIPE_PRICE_TRACKER",
    successPath: "/success/tracker/",
    title: "The Muscle-on-GLP-1 Tracker",
    file: "muscle-on-glp1-tracker.pdf",
    bonus: "creatine-glp1",
  },
  "workbook": {
    envKey: "STRIPE_PRICE_WORKBOOK",
    successPath: "/success/workbook/",
    title: "The Muscle-on-GLP-1 Workbook",
    file: "muscle-on-glp1-workbook.pdf",
    bonus: "creatine-glp1",
  },
  "research-review-2026-08": {
    envKey: "STRIPE_PRICE_RESEARCH_REVIEW_2026_08",
    successPath: "/success/research-review-2026-08/",
    title: "GLP-1 & Muscle: Research Review, August 2026",
    file: "research-review-2026-08.pdf",
    bonus: "creatine-glp1",
  },
};

/**
 * When the free-gift promo stops being advertised.
 *
 * "Limited time" with no end date is an urgency claim we could never actually
 * honour, so the offer carries a real date and the front end hides itself once
 * it passes (see the promo block in checkout.js, which mirrors this date — keep
 * the two in step).
 *
 * The BACKEND deliberately keeps granting bonuses after this date. Over-
 * delivering to someone who bought just after the cutoff is harmless; failing
 * to deliver a gift a buyer saw advertised is not. Never make this a gate on
 * `bonus` resolution in download.mjs.
 */
export const PROMO_ENDS = "2026-09-30";

/** Version of the Terms of Service buyers accept at checkout. */
export const TERMS_VERSION = "1.0 (effective 2026-07-10)";

/**
 * Netlify Blobs store holding one acceptance record per Checkout Session.
 *
 * We collect the agreement ourselves rather than using Stripe's
 * `consent_collection[terms_of_service]`, because that reads the Terms of
 * service URL from *account-wide* public details. This Stripe account also
 * serves purplelink.llc, so pointing it at the MuscleOnGLP terms would show a
 * GLP-1 fitness disclaimer to purplelink.llc's academic-tools customers.
 *
 * checkout.mjs writes the record before it hands back a Checkout URL, so
 * nobody can reach the payment page without having agreed. download.mjs then
 * refuses to serve a PDF unless the record exists.
 */
export const TOS_STORE = "tos-acceptances";

/** Netlify Blobs store holding the purchasable PDFs themselves. */
export const FILE_STORE = "guide-files";

export function tosKey(sessionId) {
  return `tos:${sessionId}`;
}

const DEFAULT_ORIGIN = "https://muscleonglp.netlify.app";

/**
 * Public origin for building links. Falls back to the Netlify URL until
 * SITE_ORIGIN is set to https://getmuscleonglp.com (the custom domain, once its
 * TLS certificate has provisioned on this site).
 */
export function siteOrigin() {
  const configured = Netlify.env.get("SITE_ORIGIN");
  return (configured || DEFAULT_ORIGIN).replace(/\/+$/, "");
}

/** The only URL from which a purchased PDF can be obtained. */
export function downloadUrl(sessionId) {
  return `${siteOrigin()}/.netlify/functions/download?session_id=${encodeURIComponent(sessionId)}`;
}

/** Same endpoint, requesting the order's free bonus file instead of the main one. */
export function bonusDownloadUrl(sessionId) {
  return `${downloadUrl(sessionId)}&bonus=1`;
}

// --- Email lead magnet ------------------------------------------------------
//
// Subscribing gets you the Protein Playbook. The PDF lives in the same private
// Blobs store as the paid guides, so the "gate" is a real one: there is no
// public URL. subscribe.mjs mints a signed, expiring token on a successful
// signup and the browser (and, via subscriber metadata, the welcome email)
// links to download.mjs?magnet=<token>. Sharing a link works until it
// expires, which is fine — this is a $5 PDF being used to build a list, not
// something worth DRM. What it must not be is a URL anyone can guess.

import { createHmac, timingSafeEqual } from "node:crypto";

export const MAGNET_PRODUCT = "protein-playbook";
const MAGNET_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function magnetSig(payload, secret) {
  return b64url(createHmac("sha256", secret).update(payload).digest());
}

/** Mint a token for *email*. Payload is expiry + a short hash of the address. */
export function magnetToken(email, secret, now = Date.now()) {
  const exp = String(now + MAGNET_TTL_MS);
  const who = b64url(createHmac("sha256", secret).update(`who:${email}`).digest()).slice(0, 12);
  const payload = `${exp}.${who}`;
  return `${payload}.${magnetSig(payload, secret)}`;
}

/** True if *token* was minted by us and has not expired. */
export function verifyMagnetToken(token, secret, now = Date.now()) {
  if (typeof token !== "string" || token.length > 200) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [exp, who, sig] = parts;
  if (!/^\d{10,16}$/.test(exp) || Number(exp) < now) return false;
  const expected = magnetSig(`${exp}.${who}`, secret);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function magnetDownloadUrl(token) {
  return `${siteOrigin()}/.netlify/functions/download?magnet=${encodeURIComponent(token)}`;
}
