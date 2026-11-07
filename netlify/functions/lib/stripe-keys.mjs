// Two Stripe accounts during the move off the Buy Me a Coffee-controlled account (same move as purplelink.llc,
// netlify/lib/stripe-account.mjs there, 2026-11-06).
//
// The old account keeps every past buyer: their Checkout Sessions only exist there, so STRIPE_SECRET_KEY and
// STRIPE_WEBHOOK_SECRET stay set. The new, directly controlled account is added beside it:
//
//   STRIPE_SECRET_KEY_NEW       sk_… of the new account
//   STRIPE_WEBHOOK_SECRET_NEW   whsec_… of this site's endpoint on the new account
//   STRIPE_PRICE_<X>_NEW        the new account's Price id for each product (Prices are per account)
//
// A product sells on the new account only when BOTH the new key and that product's _NEW price are set; otherwise it
// sells on the old account exactly as before. So a half-finished setup falls back instead of failing a sale.
// Reading a session with the other account's key is a 404 from Stripe, which is how lookups fall through.

export const OLD_KEY_ENV = "STRIPE_SECRET_KEY";
export const NEW_KEY_ENV = "STRIPE_SECRET_KEY_NEW";
export const OLD_WEBHOOK_ENV = "STRIPE_WEBHOOK_SECRET";
export const NEW_WEBHOOK_ENV = "STRIPE_WEBHOOK_SECRET_NEW";

function env(name) {
  return String(globalThis.Netlify?.env?.get(name) ?? globalThis.process?.env?.[name] ?? "").trim();
}

/**
 * Which account sells this product: { key, priceId, isNew }. priceId is null for inline-amount products.
 * key is "" when nothing is configured (the caller reports misconfigured).
 */
export function checkoutAccount(entry) {
  const newKey = env(NEW_KEY_ENV);
  if (newKey) {
    if (entry.amount) return { key: newKey, priceId: null, isNew: true };
    const newPrice = entry.envKey ? env(`${entry.envKey}_NEW`) : "";
    if (newPrice) return { key: newKey, priceId: newPrice, isNew: true };
  }
  return { key: env(OLD_KEY_ENV), priceId: entry.amount ? null : (entry.envKey ? env(entry.envKey) || null : null), isNew: false };
}

/** Every key that may know a session, newest account first, no blanks or duplicates. */
export function lookupKeys() {
  return [...new Set([env(NEW_KEY_ENV), env(OLD_KEY_ENV)].filter(Boolean))];
}

/** Every webhook signing secret this endpoint accepts (new account first). */
export function webhookSecrets() {
  return [...new Set([env(NEW_WEBHOOK_ENV), env(OLD_WEBHOOK_ENV)].filter(Boolean))];
}
