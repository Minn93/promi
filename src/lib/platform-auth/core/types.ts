import type { Platform } from "@prisma/client";

export type OAuthStartResult = {
  authorizationUrl: string;
  isMock: boolean;
};

export type OAuthCallbackInput = {
  code: string;
  state?: string | null;
  requestUrl: URL;
};

export type OAuthCallbackResult = {
  externalAccountId: string;
  displayName: string;
  username?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  metadataJson?: Record<string, unknown> | null;
  isMock: boolean;
};

export interface PlatformAuthProvider {
  readonly platform: Platform;
  buildStartUrl(requestUrl: URL): OAuthStartResult;
  exchangeCallback(input: OAuthCallbackInput): Promise<OAuthCallbackResult>;
}
