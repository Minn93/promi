import { Prisma } from "@prisma/client";
import Stripe from "stripe";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { isBillingIngestEnabledServer } from "@/src/lib/billing/billing-env";
import { maybeSyncStripeProviderEntitlement } from "@/src/lib/billing/entitlement-sync";
import {
  applyStripeMirrorPlan,
  buildStripeMirrorPlan,
  type MirrorPlan,
} from "@/src/lib/billing/stripe-event-handlers";
import { sha256HexUtf8 } from "@/src/lib/billing/payload-hash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER_SLUG = "stripe";

function webhookWhere(providerEventId: string) {
  return {
    provider_providerEventId: {
      provider: PROVIDER_SLUG,
      providerEventId,
    },
  } as const;
}

/** POST Stripe webhooks — verify signature; ingest; mirror Billing* + optional provider entitlement sync (Phase 13.2.x). */
export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim();

  if (!webhookSecret || !apiKey) {
    console.warn("[billing/stripe webhook] Misconfiguration: STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY missing.");
    return NextResponse.json({ error: "billing_misconfigured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  const stripeSdk = new Stripe(apiKey);

  let event: Stripe.Event;
  try {
    event = stripeSdk.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (!isBillingIngestEnabledServer()) {
    return NextResponse.json({
      received: true,
      persisted: false,
      reason: "billing_disabled",
    });
  }

  const payloadHash = sha256HexUtf8(rawBody);

  let ingestRow = await prisma.billingWebhookEvent.findUnique({
    where: webhookWhere(event.id),
  });

  if (ingestRow?.processedAt) {
    return NextResponse.json({
      received: true,
      alreadyProcessed: true,
      eventType: event.type,
    });
  }

  if (!ingestRow) {
    try {
      ingestRow = await prisma.billingWebhookEvent.create({
        data: {
          provider: PROVIDER_SLUG,
          providerEventId: event.id,
          eventType: event.type,
          payloadHash,
          processedAt: null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        ingestRow = await prisma.billingWebhookEvent.findUnique({
          where: webhookWhere(event.id),
        });
        if (ingestRow?.processedAt) {
          return NextResponse.json({
            received: true,
            alreadyProcessed: true,
            duplicate: true,
            eventType: event.type,
          });
        }
      } else {
        console.error("[billing/stripe webhook] Ingest create failed:", err instanceof Error ? err.message : String(err));
        return NextResponse.json({ error: "persist_failed" }, { status: 500 });
      }
    }
  }

  if (!ingestRow) {
    return NextResponse.json({ error: "ingest_missing" }, { status: 500 });
  }

  if (ingestRow.processedAt) {
    return NextResponse.json({
      received: true,
      alreadyProcessed: true,
      eventType: event.type,
    });
  }

  let plan: MirrorPlan;
  try {
    plan = await buildStripeMirrorPlan(stripeSdk, event, prisma);
  } catch (err) {
    console.error(
      "[billing/stripe webhook] Mirror plan failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json({ error: "mirror_plan_failed" }, { status: 500 });
  }

  type StripeTxResult =
    | { outcome: "done"; entitlement?: Awaited<ReturnType<typeof maybeSyncStripeProviderEntitlement>> }
    | { outcome: "noop_processed" };

  let txResult: StripeTxResult;
  try {
    txResult = await prisma.$transaction(async (tx) => {
      const fresh = await tx.billingWebhookEvent.findUnique({
        where: webhookWhere(event.id),
      });
      if (fresh?.processedAt != null) {
        return { outcome: "noop_processed" as const };
      }

      await applyStripeMirrorPlan(tx, plan);

      const entitlement = await maybeSyncStripeProviderEntitlement(tx, plan, {
        id: event.id,
        type: event.type,
      });

      await tx.billingWebhookEvent.update({
        where: webhookWhere(event.id),
        data: { processedAt: new Date() },
      });

      return { outcome: "done" as const, entitlement };
    });
  } catch (err) {
    console.error(
      "[billing/stripe webhook] Mirror transaction failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }

  if (txResult.outcome === "noop_processed") {
    return NextResponse.json({
      received: true,
      alreadyProcessedConcurrent: true,
      eventType: event.type,
    });
  }

  const mirrored = plan.kind === "apply" && Boolean(plan.customer || plan.subscription);
  const ignored = plan.kind === "none";

  const noteForLog = plan.kind === "none" ? plan.note : undefined;
  const entitlementSync =
    txResult.outcome === "done" ? txResult.entitlement ?? {} : {};

  console.info(
    `[billing/stripe webhook] Processed evt=${event.id} type=${event.type} mirrored=${mirrored}` +
      (ignored && noteForLog ? ` note=${noteForLog}` : "") +
      (entitlementSync.entitlementSkippedManual ? " entitlement=manual_locked" : "") +
      (entitlementSync.entitlementUpdated ? " entitlement=updated" : ""),
  );

  return NextResponse.json({
    received: true,
    processed: true,
    eventType: event.type,
    mirrored,
    ...(ignored ? { ignored: true as const, ...(noteForLog ? { note: noteForLog } : {}) } : {}),
    ...entitlementSync,
  });
}
