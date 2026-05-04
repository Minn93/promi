import type { Platform } from "@prisma/client";
import { disconnectConnectedAccount, listConnectedAccounts, upsertConnectedAccountFromOAuth } from "@/src/lib/services/connected-accounts/repository";
import { getPlanConfig, isLimitReached } from "@/src/lib/plans/config";
import { getPlanTierForOwner } from "@/src/lib/plans/server";

export function asPlatform(input: string): Platform | null {
  if (input === "x" || input === "instagram" || input === "facebook") return input;
  return null;
}

export async function listAccounts(ownerId: string) {
  return listConnectedAccounts(ownerId);
}

type ConnectFromOAuthInput = {
  ownerId: string;
  platform: Platform;
  externalAccountId: string;
  displayName?: string | null;
  metadataJson?: Record<string, unknown> | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
};

export async function connectAccountFromOAuth(input: ConnectFromOAuthInput) {
  const existingAccounts = await listConnectedAccounts(input.ownerId);
  const alreadyConnected = existingAccounts.some(
    (item) =>
      item.platform === input.platform
      && item.externalAccountId === input.externalAccountId,
  );
  if (!alreadyConnected) {
    const activeAccounts = existingAccounts.filter((item) => item.status !== "revoked");
    const plan = getPlanConfig(await getPlanTierForOwner(input.ownerId));
    if (isLimitReached(activeAccounts.length, plan.limits.connectedAccounts)) {
      throw new Error(
        `You reached the ${plan.label} limit of ${plan.limits.connectedAccounts} connected accounts. Upgrade to Pro to connect more accounts.`,
      );
    }
  }

  return upsertConnectedAccountFromOAuth({
    ownerId: input.ownerId,
    platform: input.platform,
    externalAccountId: input.externalAccountId,
    displayName: input.displayName ?? null,
    metadataJson: input.metadataJson ?? null,
    accessToken: input.accessToken ?? null,
    refreshToken: input.refreshToken ?? null,
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    status: "active",
  });
}

export async function disconnectAccount(ownerId: string, accountId: string) {
  return disconnectConnectedAccount(ownerId, accountId);
}
