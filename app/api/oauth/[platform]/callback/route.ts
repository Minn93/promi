import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { checkOwnerAccountGates } from "@/src/lib/auth/user-status";
import { getXConfig } from "@/src/lib/platforms/x/client";
import { getPlatformAuthProvider } from "@/src/lib/platform-auth/core/registry";
import { asPlatform, connectAccountFromOAuth } from "@/src/lib/services/connected-accounts/service";

type Params = {
  params: Promise<{ platform: string }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function oauthCallbackErrorCode(err: unknown): string {
  if (err instanceof Error && (err.message === "account_unavailable" || err.message === "email_verification_required")) {
    return err.message;
  }
  return "oauth_callback_failed";
}

export async function GET(request: Request, { params }: Params) {
  const { platform: raw } = await params;
  const platform = asPlatform(raw);
  if (!platform) {
    return apiError({ status: 400, code: "INVALID_PLATFORM", message: "Unsupported platform." });
  }

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code")?.trim();
  if (!code) {
    return apiError({ status: 400, code: "MISSING_CODE", message: "Missing OAuth code." });
  }

  try {
    const ownerId = await getCurrentOwnerId();
    const requireVerifiedEmail = platform === "x" && getXConfig().enableRealPublish;
    const policyGate = await checkOwnerAccountGates(ownerId, { requireVerifiedEmail });
    if (policyGate) {
      throw new Error(policyGate.kind);
    }
    const provider = getPlatformAuthProvider(platform);
    const callback = await provider.exchangeCallback({
      code,
      state: requestUrl.searchParams.get("state"),
      requestUrl,
    });

    await connectAccountFromOAuth({
      ownerId,
      platform,
      externalAccountId: callback.externalAccountId,
      displayName: callback.displayName,
      metadataJson: callback.metadataJson ?? null,
      accessToken: callback.accessToken ?? null,
      refreshToken: callback.refreshToken ?? null,
      tokenExpiresAt: callback.tokenExpiresAt ?? null,
    });

    const redirectUrl = new URL("/settings/accounts", requestUrl.origin);
    redirectUrl.searchParams.set("connected", platform);
    if (callback.isMock) {
      redirectUrl.searchParams.set("mock", "1");
    }
    return NextResponse.redirect(redirectUrl.toString(), { status: 302 });
  } catch (err) {
    const redirectUrl = new URL("/settings/accounts", requestUrl.origin);
    redirectUrl.searchParams.set("oauth_error", oauthCallbackErrorCode(err));
    return NextResponse.redirect(redirectUrl.toString(), { status: 302 });
  }
}
