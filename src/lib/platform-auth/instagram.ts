import type { Platform } from "@prisma/client";
import type { OAuthCallbackInput, OAuthCallbackResult, OAuthStartResult, PlatformAuthProvider } from "@/src/lib/platform-auth/core/types";

function envVarsPresent() {
  return Boolean(process.env.INSTAGRAM_CLIENT_ID?.trim() && process.env.INSTAGRAM_CLIENT_SECRET?.trim());
}

export class InstagramAuthProvider implements PlatformAuthProvider {
  readonly platform: Platform = "instagram";

  buildStartUrl(requestUrl: URL): OAuthStartResult {
    const callbackUrl = `${requestUrl.origin}/api/oauth/instagram/callback`;
    const state = crypto.randomUUID();
    if (!envVarsPresent()) {
      const url = new URL(callbackUrl);
      url.searchParams.set("code", "mock_ig");
      url.searchParams.set("state", state);
      url.searchParams.set("mock", "1");
      return { authorizationUrl: url.toString(), isMock: true };
    }

    // TODO(oauth:instagram): Replace with real provider authorization URL.
    const url = new URL("https://example.com/oauth/instagram/authorize");
    url.searchParams.set("client_id", process.env.INSTAGRAM_CLIENT_ID ?? "");
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "instagram_business_basic instagram_business_content_publish");
    url.searchParams.set("state", state);
    return { authorizationUrl: url.toString(), isMock: false };
  }

  async exchangeCallback(input: OAuthCallbackInput): Promise<OAuthCallbackResult> {
    const isMock = input.requestUrl.searchParams.get("mock") === "1" || !envVarsPresent();
    if (isMock) {
      return {
        externalAccountId: "mock-instagram-account",
        displayName: "Mock Instagram Account",
        accessToken: "mock-instagram-access-token",
        refreshToken: "mock-instagram-refresh-token",
        tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        isMock: true,
      };
    }

    // TODO(oauth:instagram): Exchange code for token and fetch account profile.
    return {
      externalAccountId: `ig-${input.code}`,
      displayName: "Instagram Account (stub)",
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      isMock: false,
    };
  }
}
