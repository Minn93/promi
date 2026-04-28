import type { ConnectedAccountStatus, Platform } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ConnectedAccountDelegate = {
  findMany: (args: unknown) => Promise<unknown>;
  findFirst: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
  create: (args: unknown) => Promise<unknown>;
};

function getConnectedAccountDelegate(): ConnectedAccountDelegate {
  const candidate = (prisma as unknown as Record<string, unknown>).connectedAccount
    ?? (prisma as unknown as Record<string, unknown>).connectedAccounts;
  if (!candidate || typeof candidate !== "object") {
    throw new Error(
      "Prisma ConnectedAccount delegate is unavailable. Run `npm run prisma:generate` and restart the dev server.",
    );
  }
  return candidate as ConnectedAccountDelegate;
}

export async function listConnectedAccounts(ownerId: string) {
  const connectedAccount = getConnectedAccountDelegate();
  return connectedAccount.findMany({
    where: { ownerId },
    orderBy: [{ platform: "asc" }, { updatedAt: "desc" }],
  }) as Promise<
    Array<{
      id: string;
      ownerId: string;
      platform: Platform;
      status: ConnectedAccountStatus;
      externalAccountId: string | null;
      displayName: string | null;
      accessToken: string | null;
      refreshToken: string | null;
      tokenExpiresAt: Date | null;
      lastError: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>
  >;
}

type UpsertConnectedAccountInput = {
  ownerId: string;
  platform: Platform;
  externalAccountId: string;
  displayName?: string | null;
  metadataJson?: Record<string, unknown> | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  status?: ConnectedAccountStatus;
};

export async function upsertConnectedAccountFromOAuth(input: UpsertConnectedAccountInput) {
  const connectedAccount = getConnectedAccountDelegate();
  const existing = (await connectedAccount.findFirst({
    where: {
      ownerId: input.ownerId,
      platform: input.platform,
      externalAccountId: input.externalAccountId,
    },
  })) as {
    id: string;
    displayName: string | null;
    accessToken: string | null;
    refreshToken: string | null;
    tokenExpiresAt: Date | null;
  } | null;

  if (existing) {
    return connectedAccount.update({
      where: { id: existing.id },
      data: {
        displayName: input.displayName ?? existing.displayName,
        metadataJson: input.metadataJson ?? undefined,
        accessToken: input.accessToken ?? existing.accessToken,
        refreshToken: input.refreshToken ?? existing.refreshToken,
        tokenExpiresAt: input.tokenExpiresAt ?? existing.tokenExpiresAt,
        status: input.status ?? "active",
        lastError: null,
      },
    });
  }

  return connectedAccount.create({
    data: {
      ownerId: input.ownerId,
      platform: input.platform,
      externalAccountId: input.externalAccountId,
      displayName: input.displayName ?? null,
      metadataJson: input.metadataJson ?? null,
      accessToken: input.accessToken ?? null,
      refreshToken: input.refreshToken ?? null,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      status: input.status ?? "active",
    },
  });
}

export async function updateConnectedAccountTokens(
  accountId: string,
  args: {
    accessToken: string;
    refreshToken: string | null;
    tokenExpiresAt: Date | null;
  },
) {
  const connectedAccount = getConnectedAccountDelegate();
  return connectedAccount.update({
    where: { id: accountId },
    data: {
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      tokenExpiresAt: args.tokenExpiresAt,
      lastError: null,
    },
  });
}

export async function disconnectConnectedAccount(ownerId: string, accountId: string) {
  const connectedAccount = getConnectedAccountDelegate();
  return connectedAccount.updateMany({
    where: { id: accountId, ownerId },
    data: {
      status: "revoked",
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
    },
  });
}

export async function findConnectedAccountByIdForOwner(ownerId: string, accountId: string) {
  const connectedAccount = getConnectedAccountDelegate();
  return connectedAccount.findFirst({
    where: { id: accountId, ownerId },
  }) as Promise<{
    id: string;
    ownerId: string;
    platform: Platform;
    status: ConnectedAccountStatus;
  } | null>;
}
