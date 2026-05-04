import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { getPlanConfig, isLimitReached } from "@/src/lib/plans/config";
import { getPlanTierForOwner } from "@/src/lib/plans/server";
import { getPlatformAuthProvider } from "@/src/lib/platform-auth/core/registry";
import { asPlatform, listAccounts } from "@/src/lib/services/connected-accounts/service";

type Params = {
  params: Promise<{ platform: string }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: Params) {
  const { platform: raw } = await params;
  const platform = asPlatform(raw);
  if (!platform) {
    return apiError({ status: 400, code: "INVALID_PLATFORM", message: "Unsupported platform." });
  }

  try {
    const ownerId = await getCurrentOwnerId();
    const plan = getPlanConfig(getPlanTierForOwner(ownerId));
    const accounts = await listAccounts(ownerId);
    const activeCount = accounts.filter((item) => item.status !== "revoked").length;
    const hasPlatformAccount = accounts.some((item) => item.platform === platform);
    if (!hasPlatformAccount && isLimitReached(activeCount, plan.limits.connectedAccounts)) {
      return apiError({
        status: 403,
        code: "PLAN_LIMIT_CONNECTED_ACCOUNTS",
        message: `You reached the ${plan.label} limit of ${plan.limits.connectedAccounts} connected accounts.`,
      });
    }

    const provider = getPlatformAuthProvider(platform);
    const start = provider.buildStartUrl(new URL(request.url));
    return NextResponse.redirect(start.authorizationUrl, { status: 302 });
  } catch (err) {
    const details = err instanceof Error ? err.message : "Unknown error";
    return apiError({ status: 500, code: "OAUTH_START_FAILED", message: "Failed to start OAuth flow.", details });
  }
}
