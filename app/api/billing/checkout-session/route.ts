import Stripe from "stripe";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { getPromiCanonicalAppUrl } from "@/src/lib/billing/app-url";
import {
  isBillingIngestEnabledServer,
  isStripeBillingProviderServer,
} from "@/src/lib/billing/billing-env";
import { STRIPE_PROVIDER_SLUG } from "@/src/lib/billing/stripe-mapping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-only hosted Checkout — never reads `owner_id` from JSON; never mutates entitlements here (webhooks only). */
export async function POST() {
  if (!isBillingIngestEnabledServer() || !isStripeBillingProviderServer()) {
    return NextResponse.json({ error: "billing_disabled" }, { status: 403 });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
  const stripeProPriceId = process.env.STRIPE_PRO_PRICE_ID?.trim();
  const appUrl = getPromiCanonicalAppUrl();

  if (!stripeSecret || !stripeProPriceId || !appUrl) {
    console.warn("[billing/checkout-session] Missing STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, or canonical app URL.");
    return NextResponse.json({ error: "billing_misconfigured" }, { status: 503 });
  }

  let ownerId: string;
  try {
    ownerId = (await getCurrentOwnerId()).trim();
  } catch {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  if (!ownerId) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  const stripe = new Stripe(stripeSecret);

  try {
    const billingRow = await prisma.billingCustomer.findUnique({
      where: { ownerId },
      select: {
        providerCustomerId: true,
        provider: true,
      },
    });

    let stripeCustomerId = billingRow?.provider === STRIPE_PROVIDER_SLUG ? billingRow.providerCustomerId.trim() : "";

    if (!stripeCustomerId) {
      const cust = await stripe.customers.create({
        metadata: { owner_id: ownerId },
      });
      stripeCustomerId = cust.id;
      await prisma.billingCustomer.upsert({
        where: { ownerId },
        create: {
          ownerId,
          provider: STRIPE_PROVIDER_SLUG,
          providerCustomerId: stripeCustomerId,
        },
        update: {
          provider: STRIPE_PROVIDER_SLUG,
          providerCustomerId: stripeCustomerId,
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      client_reference_id: ownerId,
      line_items: [{ price: stripeProPriceId, quantity: 1 }],
      metadata: {
        owner_id: ownerId,
      },
      subscription_data: {
        metadata: {
          owner_id: ownerId,
        },
      },
      success_url: `${appUrl}/upgrade?checkout=success`,
      cancel_url: `${appUrl}/upgrade?checkout=cancelled`,
    });

    if (!session.url) {
      console.error("[billing/checkout-session] Stripe session missing redirect URL.");
      return NextResponse.json({ error: "checkout_create_failed" }, { status: 500 });
    }

    console.info("[billing/checkout-session] Created session", { ownerPrefix: ownerId.slice(0, 6) });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error(
      "[billing/checkout-session] Failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json({ error: "checkout_create_failed" }, { status: 500 });
  }
}
