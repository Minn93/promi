import { AccountUnavailableState } from "@/components/account-unavailable-state";
import { PageHeader } from "@/components/page-header";
import { UpgradePricingFlow } from "@/components/upgrade-pricing-flow";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { checkOwnerAccountGates } from "@/src/lib/auth/user-status";
import { fetchOwnerEntitlementDisplay } from "@/src/lib/entitlements/server";
import { isStripeHostedCheckoutOfferedServer } from "@/src/lib/billing/billing-env";
import { getPlanTierForOwner } from "@/src/lib/plans/server";

export const dynamic = "force-dynamic";

type UpgradePageProps = {
  searchParams: Promise<{
    checkout?: string | string[];
  }>;
};

export default async function UpgradePage({ searchParams }: UpgradePageProps) {
  const params = await searchParams;
  const rawCheckout = params.checkout;
  const checkoutParam = Array.isArray(rawCheckout) ? rawCheckout[0] : rawCheckout;
  const checkoutReturn =
    checkoutParam === "success" || checkoutParam === "cancelled" ? checkoutParam : null;

  const offerStripeHostedCheckout = isStripeHostedCheckoutOfferedServer();
  const ownerId = await getCurrentOwnerId();
  const policyGate = await checkOwnerAccountGates(ownerId, { requireVerifiedEmail: false });
  if (policyGate) {
    return (
      <>
        <PageHeader
          title="Upgrade"
          description="Review your plan and Pro access options."
        />
        <AccountUnavailableState
          title="Account unavailable"
          description="Plan and upgrade details are unavailable for this account."
        />
      </>
    );
  }
  const resolvedPlanTier = await getPlanTierForOwner(ownerId);
  const entitlement = await fetchOwnerEntitlementDisplay(ownerId);
  const upgradeRequestEmail = process.env.PROMI_UPGRADE_REQUEST_EMAIL?.trim();

  /** Dev-only playground; never linked in production (see NODE_ENV gates in component + `/upgrade/checkout`). */
  const showDevMockPlayground = process.env.NODE_ENV !== "production";

  return (
    <>
      <PageHeader
        title="Upgrade"
        description={
          offerStripeHostedCheckout
            ? "Compare Free and Pro limits. Request Pro access, or continue to checkout when it is available. Returning from checkout alone does not grant Pro yet."
            : "Compare Free and Pro limits. During beta, Pro access is granted after a short request review."
        }
      />
      <UpgradePricingFlow
        ownerId={ownerId}
        resolvedPlanTier={resolvedPlanTier}
        entitlement={entitlement}
        upgradeRequestEmail={upgradeRequestEmail ?? undefined}
        showDevMockPlayground={showDevMockPlayground}
        offerStripeHostedCheckout={offerStripeHostedCheckout}
        checkoutReturn={checkoutReturn}
      />
    </>
  );
}
