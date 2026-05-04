import type { Prisma, PrismaClient } from "@prisma/client";
import type Stripe from "stripe";

import {
  normalizeStripeCustomerId,
  STRIPE_PROVIDER_SLUG,
  subscriptionToMirrorFields,
} from "@/src/lib/billing/stripe-mapping";

type DbLike = Pick<PrismaClient, "billingCustomer">;

export type MirrorPlan =
  | { kind: "none"; note?: string }
  | {
      kind: "apply";
      customer?: { ownerId: string; providerCustomerId: string };
      subscription?: {
        ownerId: string;
        providerSubscriptionId: string;
        status: string;
        periodStart: Date | null;
        periodEnd: Date | null;
        cancelAt: Date | null;
        trialEnd: Date | null;
      };
    };

export async function resolveOwnerIdForSubscription(
  db: DbLike,
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromSubMeta = subscription.metadata?.owner_id?.trim();
  if (fromSubMeta) return fromSubMeta;

  const customerId = normalizeStripeCustomerId(subscription.customer);
  if (!customerId) return null;

  const link = await db.billingCustomer.findFirst({
    where: {
      provider: STRIPE_PROVIDER_SLUG,
      providerCustomerId: customerId,
    },
    select: { ownerId: true },
  });
  if (link) return link.ownerId;

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    const fromCustomerMeta = customer.metadata?.owner_id?.trim();
    if (fromCustomerMeta) return fromCustomerMeta;
  } catch {
    return null;
  }

  return null;
}

/**
 * Builds a Stripe mirror plan for verified webhook payloads.
 *
 * **`checkout.session.completed`** (subscription mode): trusted only when **`client_reference_id` /
 * `session.metadata.owner_id`** match **`subscription.metadata.owner_id`**, populated by Promi’s
 * server Checkout Session route (Phase 13.2.4) — never from client-supplied IDs.
 *
 * Entitlement syncing is layered in the webhook handler after mirror upserts.
 */
export async function buildStripeMirrorPlan(
  stripe: Stripe,
  event: Stripe.Event,
  dbRead: DbLike,
): Promise<MirrorPlan> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode !== "subscription") {
        return { kind: "none", note: "checkout_non_subscription_mode" };
      }

      const ref = session.client_reference_id?.trim() ?? "";
      const metaOid = session.metadata?.owner_id?.trim() ?? "";
      if (ref.length > 0 && metaOid.length > 0 && ref !== metaOid) {
        return { kind: "none", note: "checkout_owner_reference_mismatch" };
      }
      const ownerId = (ref.length > 0 ? ref : metaOid).trim();
      if (!ownerId) {
        return { kind: "none", note: "checkout_missing_owner_binding" };
      }

      const customerId = normalizeStripeCustomerId(session.customer);
      const subscriptionRef = session.subscription;
      if (!subscriptionRef) {
        return { kind: "none", note: "checkout_subscription_pending" };
      }

      let subscription: Stripe.Subscription;
      try {
        subscription =
          typeof subscriptionRef === "string"
            ? await stripe.subscriptions.retrieve(subscriptionRef)
            : (subscriptionRef as Stripe.Subscription);
      } catch {
        return { kind: "none", note: "checkout_subscription_retrieve_failed" };
      }

      const subOwnerMeta = subscription.metadata?.owner_id?.trim() ?? "";
      if (subOwnerMeta !== "" && subOwnerMeta !== ownerId) {
        return { kind: "none", note: "checkout_subscription_owner_mismatch" };
      }

      const fields = subscriptionToMirrorFields(subscription);

      return {
        kind: "apply",
        customer:
          customerId != null ? { ownerId, providerCustomerId: customerId } : undefined,
        subscription: {
          ownerId,
          providerSubscriptionId: subscription.id,
          ...fields,
        },
      };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const ownerId = await resolveOwnerIdForSubscription(dbRead, stripe, subscription);
      if (!ownerId) {
        return { kind: "none", note: "subscription_no_owner_resolution" };
      }

      const customerId = normalizeStripeCustomerId(subscription.customer);
      const fields = subscriptionToMirrorFields(subscription);

      return {
        kind: "apply",
        customer:
          customerId != null ? { ownerId, providerCustomerId: customerId } : undefined,
        subscription: {
          ownerId,
          providerSubscriptionId: subscription.id,
          ...fields,
        },
      };
    }

    default:
      return { kind: "none", note: `unsupported_event_type:${event.type}` };
  }
}

export async function applyStripeMirrorPlan(
  tx: Prisma.TransactionClient,
  plan: MirrorPlan,
): Promise<void> {
  if (plan.kind !== "apply") return;

  if (plan.customer) {
    await tx.billingCustomer.upsert({
      where: { ownerId: plan.customer.ownerId },
      create: {
        ownerId: plan.customer.ownerId,
        provider: STRIPE_PROVIDER_SLUG,
        providerCustomerId: plan.customer.providerCustomerId,
      },
      update: {
        providerCustomerId: plan.customer.providerCustomerId,
        provider: STRIPE_PROVIDER_SLUG,
      },
    });
  }

  if (plan.subscription) {
    const s = plan.subscription;
    await tx.billingSubscription.upsert({
      where: { providerSubscriptionId: s.providerSubscriptionId },
      create: {
        ownerId: s.ownerId,
        provider: STRIPE_PROVIDER_SLUG,
        providerSubscriptionId: s.providerSubscriptionId,
        status: s.status,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        cancelAt: s.cancelAt,
        trialEnd: s.trialEnd,
      },
      update: {
        ownerId: s.ownerId,
        status: s.status,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        cancelAt: s.cancelAt,
        trialEnd: s.trialEnd,
        provider: STRIPE_PROVIDER_SLUG,
      },
    });
  }
}
