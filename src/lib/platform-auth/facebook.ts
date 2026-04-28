import type { Platform } from "@prisma/client";
import type { OAuthCallbackInput, OAuthCallbackResult, OAuthStartResult, PlatformAuthProvider } from "@/src/lib/platform-auth/core/types";

function envVarsPresent() {
  return Boolean(process.env.FACEBOOK_CLIENT_ID?.trim() && process.env.FACEBOOK_CLIENT_SECRET?.trim());
}

export class FacebookAuthProvider implements PlatformAuthProvider {
  readonly platform: Platform = "facebook";

  buildStartUrl(requestUrl: URL): OAuthStartResult {
    const callbackUrl = `${requestUrl.origin}/api/oauth/facebook/callback`;
    const state = crypto.randomUUID();
    if (!envVarsPresent()) {
      const url = new URL(callbackUrl);
      url.searchParams.set("code", "mock_fb");
      url.searchParams.set("state", state);
      url.searchParams.set("mock", "1");
      return { authorizationUrl: url.toString(), isMock: true };
    }

    // TODO(oauth:facebook): Replace with real provider authorization URL.
    const url = new URL("https://example.com/oauth/facebook/authorize");
    url.searchParams.set("client_id", process.env.FACEBOOK_CLIENT_ID ?? "");
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "pages_show_list pages_manage_posts pages_read_engagement");
    url.searchParams.set("state", state);
    return { authorizationUrl: url.toString(), isMock: false };
  }

  async exchangeCallback(input: OAuthCallbackInput): Promise<OAuthCallbackResult> {
    const isMock = input.requestUrl.searchParams.get("mock") === "1" || !envVarsPresent();
    if (isMock) {
      return {
        externalAccountId: "mock-facebook-account",
        displayName: "Mock Facebook Page",
        accessToken: "mock-facebook-access-token",
        refreshToken: "mock-facebook-refresh-token",
        tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        isMock: true,
      };
    }

    // TODO(oauth:facebook): Exchange code for token and fetch account profile.
    return {
      externalAccountId: `fb-${input.code}`,
      displayName: "Facebook Page (stub)",
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      isMock: false,
    };
  }
}
