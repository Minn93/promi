export type PlanTier = "free" | "pro";
import { getClientEffectivePlanTier } from "@/src/lib/billing/client";

export type PlanFeatureKey =
  | "advancedAnalytics"
  | "multiAccount"
  | "templateReuse"
  | "advancedOperations";

export type PlanLimits = {
  connectedAccounts: number;
  scheduledPostsActive: number;
  reusableTemplates: number;
  analyticsMaxDays: number;
};

export type PlanConfig = {
  tier: PlanTier;
  label: string;
  limits: PlanLimits;
  features: Record<PlanFeatureKey, boolean>;
};

export const PLAN_CONFIG: Record<PlanTier, PlanConfig> = {
  free: {
    tier: "free",
    label: "Free",
    limits: {
      connectedAccounts: 1,
      scheduledPostsActive: 15,
      reusableTemplates: 5,
      analyticsMaxDays: 30,
    },
    features: {
      advancedAnalytics: false,
      multiAccount: false,
      templateReuse: true,
      advancedOperations: false,
    },
  },
  pro: {
    tier: "pro",
    label: "Pro",
    limits: {
      connectedAccounts: 20,
      scheduledPostsActive: 300,
      reusableTemplates: 200,
      analyticsMaxDays: 3650,
    },
    features: {
      advancedAnalytics: true,
      multiAccount: true,
      templateReuse: true,
      advancedOperations: true,
    },
  },
};

export function normalizePlanTier(value: string | null | undefined): PlanTier {
  return value === "pro" ? "pro" : "free";
}

export function getPlanConfig(tier: PlanTier): PlanConfig {
  return PLAN_CONFIG[tier];
}

export function hasPlanFeature(tier: PlanTier, feature: PlanFeatureKey): boolean {
  return PLAN_CONFIG[tier].features[feature];
}

export function isLimitReached(currentCount: number, limit: number): boolean {
  return currentCount >= limit;
}

export function getClientPlanTier(): PlanTier {
  return getClientEffectivePlanTier();
}

export function limitLabel(limit: number): string {
  if (!Number.isFinite(limit)) return "unlimited";
  return limit.toLocaleString();
}
