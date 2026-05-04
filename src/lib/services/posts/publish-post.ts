import type { ConnectedAccount, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensurePlatformRegistry } from "@/src/lib/platforms";
import { getPublisher } from "@/src/lib/platforms/core/registry";
import { PlatformPublishError, PUBLISH_ERROR_CODES, toPlatformPublishError } from "@/src/lib/platforms/core/errors";
import type { PublishInput, PublishResult } from "@/src/lib/platforms/core/types";
import { getXConfig } from "@/src/lib/platforms/x/client";
import { refreshXAccessToken } from "@/src/lib/platforms/x/refresh-x-access-token";
import { updateConnectedAccountTokens } from "@/src/lib/services/connected-accounts/repository";
import {
  asPlatform,
  findConnectedAccountForPost,
  getScheduledPostForPublish,
  payloadToText,
  persistPublishFailure,
  persistPublishSuccess,
} from "@/src/lib/services/posts/publish-repository";

type PublishPostServiceResult = {
  status: "published" | "failed" | "needs_reconnect";
  message: string;
};

/** Refresh access token this long before expiry to reduce mid-request 401s. */
const X_TOKEN_EXPIRY_SKEW_MS = 120_000;

function requiresReconnect(code: string) {
  return (
    code === PUBLISH_ERROR_CODES.ACCOUNT_NOT_FOUND
    || code === PUBLISH_ERROR_CODES.ACCOUNT_INACTIVE
    || code === PUBLISH_ERROR_CODES.AUTH_EXPIRED
    || code === PUBLISH_ERROR_CODES.AUTH_REVOKED
    || code === PUBLISH_ERROR_CODES.TOKEN_REFRESH_FAILED
    || code === PUBLISH_ERROR_CODES.X_AUTH_REQUIRED
  );
}

function isExpiredToken(tokenExpiresAt: Date | null | undefined) {
  if (!tokenExpiresAt) return false;
  return tokenExpiresAt.getTime() <= Date.now();
}

function isMockConnectedAccount(account: ConnectedAccount | null): boolean {
  if (!account) return false;
  if (account.externalAccountId?.startsWith("mock-") || account.accessToken?.startsWith("mock-")) return true;
  return (
    Boolean(account.metadataJson)
    && typeof account.metadataJson === "object"
    && !Array.isArray(account.metadataJson)
    && (account.metadataJson as Record<string, unknown>).isMock === true
  );
}

function shouldRefreshXAccessToken(account: ConnectedAccount): boolean {
  const rt = account.refreshToken?.trim();
  if (!rt) return false;
  if (!account.accessToken?.trim()) return true;
  if (!account.tokenExpiresAt) return false;
  return account.tokenExpiresAt.getTime() <= Date.now() + X_TOKEN_EXPIRY_SKEW_MS;
}

function buildPublishInput(
  post: { id: string; contentPayload: Prisma.JsonValue; imageUrl: string | null; idempotencyKey: string | null },
  platform: ReturnType<typeof asPlatform>,
  account: ConnectedAccount | null,
): PublishInput {
  return {
    platform,
    accountId: account?.id ?? `mock-${platform}-account`,
    text: payloadToText(post.contentPayload),
    mediaUrl: post.imageUrl ?? null,
    idempotencyKey: post.idempotencyKey ?? null,
    accessToken: account?.accessToken ?? null,
    externalAccountId: account?.externalAccountId ?? null,
    isMockAccount: isMockConnectedAccount(account),
  };
}

export async function publishPost(postId: string): Promise<PublishPostServiceResult> {
  ensurePlatformRegistry();
  const post = await getScheduledPostForPublish(postId);
  if (!post) {
    throw new Error(`Scheduled post not found: ${postId}`);
  }

  const platform = asPlatform(post.platform);

  let workingAccount = await findConnectedAccountForPost(prisma, post.id, post.ownerId, post.accountId, platform);
  if (!workingAccount && post.accountId) {
    const message = "Connected account was not found for this post.";
    const failedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await persistPublishFailure(tx, {
        scheduledPostId: post.id,
        ownerId: post.ownerId,
        accountId: post.accountId,
        platform,
        code: PUBLISH_ERROR_CODES.ACCOUNT_NOT_FOUND,
        message,
        failedAt,
        needsReconnect: true,
      });
    });
    return { status: "needs_reconnect", message };
  }
  if (workingAccount && workingAccount.status !== "active") {
    const inactiveAccountId = workingAccount.id;
    const message = `Connected account is not active (${workingAccount.status}).`;
    const failedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await persistPublishFailure(tx, {
        scheduledPostId: post.id,
        ownerId: post.ownerId,
        accountId: inactiveAccountId,
        platform,
        code: PUBLISH_ERROR_CODES.ACCOUNT_INACTIVE,
        message,
        failedAt,
        needsReconnect: true,
      });
    });
    return { status: "needs_reconnect", message };
  }

  const isMock = isMockConnectedAccount(workingAccount);
  const xConfig = getXConfig();
  if (platform === "x" && workingAccount && !isMock && xConfig.enableRealPublish) {
    const xAccount = workingAccount;
    const hasRt = Boolean(xAccount.refreshToken?.trim());
    const accessMissing = !xAccount.accessToken?.trim();
    const expired = isExpiredToken(xAccount.tokenExpiresAt);

    if ((accessMissing || expired) && !hasRt) {
      const message = "X access token is missing or expired and no refresh token is stored. Reconnect the account.";
      const failedAt = new Date();
      await prisma.$transaction(async (tx) => {
        await persistPublishFailure(tx, {
          scheduledPostId: post.id,
          ownerId: post.ownerId,
          accountId: xAccount.id,
          platform,
          code: PUBLISH_ERROR_CODES.X_AUTH_REQUIRED,
          message,
          failedAt,
          needsReconnect: true,
        });
      });
      return { status: "needs_reconnect", message };
    }

    if (hasRt && shouldRefreshXAccessToken(xAccount)) {
      try {
        const bundle = await refreshXAccessToken(xAccount.refreshToken!.trim());
        await updateConnectedAccountTokens(xAccount.id, bundle);
        workingAccount = (await findConnectedAccountForPost(prisma, post.id, post.ownerId, post.accountId, platform)) ?? xAccount;
      } catch (err) {
        const normalized = toPlatformPublishError(err);
        const failedAt = new Date();
        const code =
          normalized.code === PUBLISH_ERROR_CODES.CONFIGURATION_ERROR
            ? normalized.code
            : PUBLISH_ERROR_CODES.TOKEN_REFRESH_FAILED;
        const message =
          normalized.code === PUBLISH_ERROR_CODES.CONFIGURATION_ERROR
            ? normalized.message
            : normalized.message || "X token refresh failed.";
        await prisma.$transaction(async (tx) => {
          await persistPublishFailure(tx, {
            scheduledPostId: post.id,
            ownerId: post.ownerId,
            accountId: xAccount.id,
            platform,
            code,
            message,
            failedAt,
            needsReconnect: requiresReconnect(code),
          });
        });
        return { status: requiresReconnect(code) ? "needs_reconnect" : "failed", message };
      }
    }
  }

  const publisher = getPublisher(platform);
  const publishInput = buildPublishInput(post, platform, workingAccount);

  let did401RefreshRetry = false;

  try {
    const validation = await publisher.validate(publishInput);
    if (!validation.ok) {
      throw new PlatformPublishError(
        PUBLISH_ERROR_CODES.VALIDATION_FAILED,
        validation.message || "Publish input is invalid.",
      );
    }

    let publishResult: PublishResult;
    try {
      publishResult = await publisher.publish(publishInput);
    } catch (pubErr) {
      const pubNorm = toPlatformPublishError(pubErr);
      const canRetry401 =
        platform === "x"
        && workingAccount?.id
        && xConfig.enableRealPublish
        && !isMock
        && pubNorm.code === PUBLISH_ERROR_CODES.AUTH_EXPIRED
        && workingAccount.refreshToken?.trim()
        && !did401RefreshRetry;

      if (canRetry401 && workingAccount) {
        did401RefreshRetry = true;
        const retryAccount = workingAccount;
        try {
          const bundle = await refreshXAccessToken(retryAccount.refreshToken!.trim());
          await updateConnectedAccountTokens(retryAccount.id, bundle);
          publishInput.accessToken = bundle.accessToken;
          publishResult = await publisher.publish(publishInput);
        } catch (inner) {
          const innerNorm = toPlatformPublishError(inner);
          const reconnectByCode = requiresReconnect(innerNorm.code);
          const failedAt = new Date();
          await prisma.$transaction(async (tx) => {
            await persistPublishFailure(tx, {
              scheduledPostId: post.id,
              ownerId: post.ownerId,
              accountId: retryAccount.id,
              platform,
              code: innerNorm.code,
              message: innerNorm.message,
              failedAt,
              needsReconnect: reconnectByCode,
            });
          });
          return { status: reconnectByCode ? "needs_reconnect" : "failed", message: innerNorm.message };
        }
      } else {
        throw pubErr;
      }
    }

    const processedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await persistPublishSuccess(tx, {
        scheduledPostId: post.id,
        ownerId: post.ownerId,
        accountId: workingAccount?.id ?? null,
        platform,
        providerPostId: publishResult.providerPostId,
        providerUrl: publishResult.providerUrl,
        rawResponse: publishResult.rawResponse,
        message: publishResult.message,
        processedAt,
      });
    });
    return { status: "published", message: publishResult.message };
  } catch (err) {
    const normalized = toPlatformPublishError(err);
    const failedAt = new Date();
    const needsReconnect = requiresReconnect(normalized.code);
    await prisma.$transaction(async (tx) => {
      await persistPublishFailure(tx, {
        scheduledPostId: post.id,
        ownerId: post.ownerId,
        accountId: workingAccount?.id ?? null,
        platform,
        code: normalized.code,
        message: normalized.message,
        failedAt,
        needsReconnect,
      });
    });
    return { status: needsReconnect ? "needs_reconnect" : "failed", message: normalized.message };
  }
}
