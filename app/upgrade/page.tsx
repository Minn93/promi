import { PageHeader } from "@/components/page-header";
import { UpgradePricingFlow } from "@/components/upgrade-pricing-flow";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { fetchOwnerEntitlementDisplay } from "@/src/lib/entitlements/server";
import { isStripeHostedCheckoutOfferedServer } from "@/src/lib/billing/billing-env";
import { isInternalBetaModeServer } from "@/src/lib/internal-beta-mode";
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

  const internalBetaMode = isInternalBetaModeServer();
  const offerStripeHostedCheckout = isStripeHostedCheckoutOfferedServer();
  const ownerId = await getCurrentOwnerId();
  const resolvedPlanTier = await getPlanTierForOwner(ownerId);
  const entitlement = await fetchOwnerEntitlementDisplay(ownerId);
  const upgradeRequestEmail = process.env.PROMI_UPGRADE_REQUEST_EMAIL?.trim();

  /** Dev-only playground; never linked in production (see NODE_ENV gates in component + `/upgrade/checkout`). */
  const showDevMockPlayground = process.env.NODE_ENV !== "production";

  return (
    <>
      <PageHeader
        title={internalBetaMode ? "Pro access (internal beta)" : "Pro access (closed beta)"}
        description={
          internalBetaMode
            ? offerStripeHostedCheckout
              ? "Manual approval remains available. Hosted Stripe Checkout may be enabled by operators — Pro activates only after verified webhooks update entitlements; return URLs are not proof of access."
              : "Manual approval requests only — no checkout or payments in-app. Operators grant Pro with the entitlement CLI when approved."
            : offerStripeHostedCheckout
              ? "Request Pro through manual operator approval or continue to hosted Stripe Checkout when billing is configured. Enforcement is server-side; successful return to this page does not grant Pro."
              : "Request Pro limits through manual operator approval — there is no self-serve payment or checkout yet."
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
