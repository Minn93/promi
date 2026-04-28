import { buildXOAuthBasicAuthorizationHeader, getXOAuthConfig } from "@/src/lib/platform-auth/x-config";
import { PlatformPublishError, PUBLISH_ERROR_CODES } from "@/src/lib/platforms/core/errors";
import { getXApiBaseUrl } from "@/src/lib/platforms/x/client";

export type RefreshXAccessTokenResult = {
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
};

/**
 * Exchanges an X OAuth 2.0 refresh_token for new tokens (same endpoint as authorization_code grant).
 * Caller persists the result to `ConnectedAccount`.
 */
export async function refreshXAccessToken(refreshToken: string): Promise<RefreshXAccessTokenResult> {
  const trimmed = refreshToken.trim();
  if (!trimmed) {
    throw new PlatformPublishError(PUBLISH_ERROR_CODES.TOKEN_REFRESH_FAILED, "X refresh token is empty.");
  }

  const oauth = getXOAuthConfig();
  if (!oauth.isConfigured) {
    throw new PlatformPublishError(
      PUBLISH_ERROR_CODES.CONFIGURATION_ERROR,
      `X OAuth client is not configured (${oauth.missing.join(", ")}).`,
    );
  }

  const base = getXApiBaseUrl().replace(/\/+$/, "");
  const tokenRes = await fetch(`${base}/2/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: buildXOAuthBasicAuthorizationHeader(oauth.config.clientId, oauth.config.clientSecret),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: trimmed,
    }),
  });

  const tokenRaw = await tokenRes.text();
  let tokenBody: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null = null;
  try {
    tokenBody = JSON.parse(tokenRaw) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
  } catch {
    tokenBody = null;
  }

  if (!tokenRes.ok || !tokenBody?.access_token?.trim()) {
    const detail =
      tokenBody?.error_description?.trim()
      || tokenBody?.error?.trim()
      || `HTTP ${tokenRes.status}`;
    throw new PlatformPublishError(
      PUBLISH_ERROR_CODES.TOKEN_REFRESH_FAILED,
      `X token refresh failed: ${detail}`,
    );
  }

  const expiresInSec = Number(tokenBody.expires_in ?? 0);
  const tokenExpiresAt =
    Number.isFinite(expiresInSec) && expiresInSec > 0 ? new Date(Date.now() + expiresInSec * 1000) : null;

  const nextRefresh = tokenBody.refresh_token?.trim() || trimmed;

  return {
    accessToken: tokenBody.access_token.trim(),
    refreshToken: nextRefresh,
    tokenExpiresAt,
  };
}
