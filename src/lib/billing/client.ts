import {
  defaultBillingState,
  isBillingStatus,
  planTierFromBillingStatus,
  type BillingState,
  type BillingStatus,
} from "@/src/lib/billing/model";
import type { PlanTier } from "@/src/lib/plans/config";

const BILLING_STATE_KEY = "promi:billing:state:v1";

function nowIso(): string {
  return new Date().toISOString();
}

export function readClientBillingState(): BillingState {
  if (typeof window === "undefined") return defaultBillingState();
  const raw = window.localStorage.getItem(BILLING_STATE_KEY);
  if (!raw) return defaultBillingState();
  try {
    const parsed = JSON.parse(raw) as Partial<BillingState>;
    const status = parsed.status ?? null;
    if (!isBillingStatus(status)) return defaultBillingState();
    return {
      status,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
    };
  } catch {
    return defaultBillingState();
  }
}

export function writeClientBillingStatus(status: BillingStatus): BillingState {
  if (typeof window === "undefined") return defaultBillingState();
  const next: BillingState = { status, updatedAt: nowIso() };
  window.localStorage.setItem(BILLING_STATE_KEY, JSON.stringify(next));
  return next;
}

export function clearClientBillingState(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(BILLING_STATE_KEY);
}

export function getClientEffectivePlanTier(): PlanTier {
  const billingState = readClientBillingState();
  const fromBilling = planTierFromBillingStatus(billingState.status);
  if (billingState.status !== "free") return fromBilling;
  const fromEnv = process.env.NEXT_PUBLIC_PROMI_DEFAULT_PLAN === "pro" ? "pro" : "free";
  return fromEnv;
}

export function startMockUpgrade(): BillingState {
  return writeClientBillingStatus("pro_pending");
}

export function confirmMockUpgrade(): BillingState {
  return writeClientBillingStatus("pro");
}

export function cancelSubscriptionMock(): BillingState {
  return writeClientBillingStatus("canceled");
}
