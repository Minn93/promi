import { getPromiCanonicalAppUrl } from "@/src/lib/billing/app-url";

function parseBillingFlag(value: string | undefined, defaultDisabled: boolean): boolean {
  if (value == null || value.trim() === "") return defaultDisabled;
  const n = value.trim().toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}

/** Default OFF — set `PROMI_BILLING_ENABLED=1` to persist Stripe webhooks server-side (Phase 13.2.x). */
export function isBillingIngestEnabledServer(): boolean {
  return parseBillingFlag(process.env.PROMI_BILLING_ENABLED, false);
}

export function isStripeBillingProviderServer(): boolean {
  return process.env.PROMI_BILLING_PROVIDER?.trim().toLowerCase() === "stripe";
}

export function isStripeHostedCheckoutOfferedServer(): boolean {
  return (
    isBillingIngestEnabledServer()
    && isStripeBillingProviderServer()
    && Boolean(process.env.STRIPE_SECRET_KEY?.trim())
    && Boolean(process.env.STRIPE_PRO_PRICE_ID?.trim())
    && Boolean(getPromiCanonicalAppUrl())
  );
}
