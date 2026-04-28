import type { PlanTier } from "@/src/lib/plans/config";

export type BillingStatus = "free" | "pro_pending" | "pro" | "canceled";

export type BillingState = {
  status: BillingStatus;
  updatedAt: string;
};

export function isBillingStatus(value: string | null | undefined): value is BillingStatus {
  return value === "free" || value === "pro_pending" || value === "pro" || value === "canceled";
}

export function planTierFromBillingStatus(status: BillingStatus): PlanTier {
  return status === "pro" ? "pro" : "free";
}

export function defaultBillingState(): BillingState {
  return {
    status: "free",
    updatedAt: new Date(0).toISOString(),
  };
}
