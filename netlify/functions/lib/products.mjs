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
 * This lives in lib/ rather than beside the functions because every top-level
 * file in the functions directory is deployed as its own endpoint.
 */
export const PRODUCTS = {
  "muscleonglp-guide": {
    envKey: "STRIPE_PRICE_MUSCLEONGLP_GUIDE",
    successPath: "/success/",
    title: "Preserving Lean Mass on GLP-1 Therapy",
    file: "preserving-lean-mass-on-glp1.pdf",
  },
  // The Complete Pack: the main guide + all four companion guides merged into
  // one 60-page PDF. A distinct product with its own Stripe Price and its own
  // merged file, so it rides the exact same single-file download/webhook path
  // as every other product (no multi-file fulfillment code). This is the
  // headline "best value" tier — it lifts the typical order from the $5 main
  // guide to the pack.
  "complete-pack": {
    envKey: "STRIPE_PRICE_COMPLETE_PACK",
    successPath: "/success/complete-pack/",
    title: "The Complete GLP-1 Muscle Pack",
    file: "complete-pack.pdf",
  },
  "protein-playbook": {
    envKey: "STRIPE_PRICE_PROTEIN_PLAYBOOK",
    successPath: "/success/protein-playbook/",
    title: "The Protein Playbook",
    file: "protein-playbook.pdf",
  },
  "creatine-glp1": {
    envKey: "STRIPE_PRICE_CREATINE_GLP1",
    successPath: "/success/creatine-glp1/",
    title: "Creatine on a GLP-1",
    file: "creatine-on-glp1.pdf",
  },
  "no-gym-plan": {
    envKey: "STRIPE_PRICE_NO_GYM_PLAN",
    successPath: "/success/no-gym-plan/",
    title: "The No-Gym Plan",
    file: "no-gym-plan.pdf",
  },
  "off-ramp": {
    envKey: "STRIPE_PRICE_OFF_RAMP",
    successPath: "/success/off-ramp/",
    title: "The GLP-1 Off-Ramp",
    file: "glp1-off-ramp.pdf",
  },
};

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
