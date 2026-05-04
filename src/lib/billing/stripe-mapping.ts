import type Stripe from "stripe";

const PROVIDER = "stripe";

export const STRIPE_PROVIDER_SLUG = PROVIDER;

export function unixSecondsToDate(seconds: number | null | undefined): Date | null {
  if (seconds == null || seconds === 0) return null;
  return new Date(seconds * 1000);
}

export function subscriptionToMirrorFields(subscription: Stripe.Subscription): {
  status: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  cancelAt: Date | null;
  trialEnd: Date | null;
} {
  return {
    status: subscription.status,
    periodStart: unixSecondsToDate(subscription.current_period_start),
    periodEnd: unixSecondsToDate(subscription.current_period_end),
    cancelAt: unixSecondsToDate(subscription.cancel_at),
    trialEnd: unixSecondsToDate(subscription.trial_end),
  };
}

export function normalizeStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (customer == null) return null;
  if (typeof customer === "string") return customer.trim() || null;
  if ("deleted" in customer && customer.deleted) return null;
  return customer.id;
}
