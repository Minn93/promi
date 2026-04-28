type XOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
};

export function getXOAuthConfig() {
  const clientId = process.env.X_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.X_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = process.env.X_OAUTH_REDIRECT_URI?.trim() || undefined;
  const missing: string[] = [];
  if (!clientId) missing.push("X_CLIENT_ID");
  if (!clientSecret) missing.push("X_CLIENT_SECRET");
  return {
    isConfigured: missing.length === 0,
    missing,
    config: { clientId, clientSecret, redirectUri } satisfies XOAuthConfig,
  };
}

export function getXOAuthRedirectUri(requestUrl: URL) {
  const { config } = getXOAuthConfig();
  const raw = config.redirectUri?.trim();
  if (!raw) return `${requestUrl.origin}/api/oauth/x/callback`;
  if (raw.startsWith("/")) return `${requestUrl.origin}${raw}`;
  return raw;
}

/** Confidential clients: X requires `Authorization: Basic` base64(client_id:client_secret) on POST /2/oauth2/token. */
export function buildXOAuthBasicAuthorizationHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}
