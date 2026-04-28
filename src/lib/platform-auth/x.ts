import type { Platform } from "@prisma/client";
import type { OAuthCallbackInput, OAuthCallbackResult, OAuthStartResult, PlatformAuthProvider } from "@/src/lib/platform-auth/core/types";
import { buildXOAuthBasicAuthorizationHeader, getXOAuthConfig, getXOAuthRedirectUri } from "@/src/lib/platform-auth/x-config";

function encodeState(payload: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeState(state?: string | null): Record<string, unknown> | null {
  if (!state?.trim()) return null;
  try {
    const raw = Buffer.from(state, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function randomVerifier() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export class XAuthProvider implements PlatformAuthProvider {
  readonly platform: Platform = "x";

  buildStartUrl(requestUrl: URL): OAuthStartResult {
    const oauth = getXOAuthConfig();
    if (!oauth.isConfigured) {
      const state = encodeState({ mock: true, reason: `Missing ${oauth.missing.join(", ")}` });
      // Always same-origin so mock connect hits this app (X_OAUTH_REDIRECT_URI may point at another host).
      const url = new URL(`${requestUrl.origin}/api/oauth/x/callback`);
      url.searchParams.set("code", "mock_x");
      url.searchParams.set("state", state);
      url.searchParams.set("mock", "1");
      return { authorizationUrl: url.toString(), isMock: true };
    }

    const callbackUrl = getXOAuthRedirectUri(requestUrl);
    const codeVerifier = randomVerifier();
    const state = encodeState({ cv: codeVerifier });
    // TODO(security): Persist verifier/state server-side with TTL instead of encoding in state.
    const url = new URL("https://x.com/i/oauth2/authorize");
    url.searchParams.set("client_id", oauth.config.clientId);
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("code_challenge", codeVerifier);
    url.searchParams.set("code_challenge_method", "plain");
    url.searchParams.set("scope", "tweet.read tweet.write users.read offline.access media.write");
    url.searchParams.set("state", state);
    return { authorizationUrl: url.toString(), isMock: false };
  }

  async exchangeCallback(input: OAuthCallbackInput): Promise<OAuthCallbackResult> {
    const oauth = getXOAuthConfig();
    const isMock = input.requestUrl.searchParams.get("mock") === "1" || !oauth.isConfigured;
    if (isMock) {
      return {
        externalAccountId: "mock-x-account",
        displayName: "Mock X Account",
        username: "mock_x",
        accessToken: "mock-x-access-token",
        refreshToken: "mock-x-refresh-token",
        tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        metadataJson: {
          isMock: true,
          providerAccountId: "mock-x-account",
          username: "mock_x",
          reason: oauth.isConfigured ? "Explicit mock query flag" : `Missing ${oauth.missing.join(", ")}`,
        },
        isMock: true,
      };
    }

    const callbackUrl = getXOAuthRedirectUri(input.requestUrl);
    const state = decodeState(input.state);
    const codeVerifier = typeof state?.cv === "string" ? state.cv : "";
    if (!codeVerifier) {
      throw new Error("Missing X OAuth code verifier in state.");
    }

    const tokenRes = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: buildXOAuthBasicAuthorizationHeader(oauth.config.clientId, oauth.config.clientSecret),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: callbackUrl,
        code_verifier: codeVerifier,
      }),
    });
    const tokenRaw = await tokenRes.text();
    const tokenBody = (() => {
      try {
        return JSON.parse(tokenRaw) as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          token_type?: string;
          scope?: string;
          error?: string;
          error_description?: string;
        };
      } catch {
        return null;
      }
    })();
    if (!tokenRes.ok || !tokenBody?.access_token?.trim()) {
      if (tokenRes.status === 401) {
        const oneLine = tokenRaw.replace(/\s+/g, " ").slice(0, 800);
        console.error("[x-oauth] token exchange 401 response:", oneLine);
      }
      throw new Error(`X token exchange failed (${tokenRes.status}).`);
    }

    const profileRes = await fetch("https://api.x.com/2/users/me?user.fields=username,name", {
      headers: {
        Authorization: `Bearer ${tokenBody.access_token}`,
      },
    });
    const profileBody = (await profileRes.json().catch(() => null)) as
      | { data?: { id?: string; username?: string; name?: string } }
      | null;
    if (!profileRes.ok || !profileBody?.data?.id?.trim()) {
      throw new Error(`X profile fetch failed (${profileRes.status}).`);
    }

    const expiresInSec = Number(tokenBody.expires_in ?? 0);
    const tokenExpiresAt = Number.isFinite(expiresInSec) && expiresInSec > 0
      ? new Date(Date.now() + expiresInSec * 1000)
      : null;

    return {
      externalAccountId: profileBody.data.id,
      displayName: profileBody.data.name?.trim() || profileBody.data.username?.trim() || "X Account",
      username: profileBody.data.username?.trim() || null,
      accessToken: tokenBody.access_token,
      refreshToken: tokenBody.refresh_token?.trim() || null,
      tokenExpiresAt,
      metadataJson: {
        isMock: false,
        providerAccountId: profileBody.data.id,
        username: profileBody.data.username?.trim() || null,
        tokenType: tokenBody.token_type ?? null,
        scope: tokenBody.scope ?? null,
      },
      isMock: false,
    };
  }
}
