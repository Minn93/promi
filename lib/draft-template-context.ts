import type { PublishPlatform } from "./publish-platform-copy";

export type { PublishPlatform };

export function isPublishPlatform(value: unknown): value is PublishPlatform {
  return value === "x" || value === "instagram" || value === "facebook";
}

/** Drafts saved before platform was stored reopen on X. */
export function restoreDraftPlatform(value: unknown): PublishPlatform {
  return isPublishPlatform(value) ? value : "x";
}

/**
 * Store a connected account only when the user picked one on X.
 * An empty selection means "Most recently connected X account".
 * Instagram and Facebook never store an account id.
 */
export function draftAccountIdForStorage(platform: PublishPlatform, accountId: string): string | undefined {
  if (platform !== "x") return undefined;
  const trimmed = accountId.trim();
  return trimmed ? trimmed : undefined;
}

export function draftContextForStorage(
  platform: PublishPlatform,
  accountId: string,
): { platform: PublishPlatform; accountId?: string } {
  const storedAccountId = draftAccountIdForStorage(platform, accountId);
  return storedAccountId ? { platform, accountId: storedAccountId } : { platform };
}

/** Reads platform and account id from a saved draft. Partial or corrupt values fall back safely. */
export function readDraftContext(value: unknown): { platform: PublishPlatform; accountId?: string } {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return draftContextForStorage(
    restoreDraftPlatform(record.platform),
    typeof record.accountId === "string" ? record.accountId : "",
  );
}

export type ConnectedAccountSnapshot = {
  id: string;
  platform: string;
  status: string;
};

export type DraftAccountRestore =
  | { status: "pending" }
  | { status: "recent"; accountId: "" }
  | { status: "restored"; accountId: string }
  | { status: "unavailable"; accountId: "" };

export const PREVIOUS_ACCOUNT_UNAVAILABLE_NOTICE =
  "The previously selected account is no longer available. The most recently connected X account will be used.";

/**
 * `accounts` must already be limited to the signed-in owner.
 * Pass `null` while that list is still loading.
 * A saved id is selected only when it is still an active X account in the list.
 */
export function restoreDraftAccount(
  platform: PublishPlatform,
  savedAccountId: string,
  accounts: ConnectedAccountSnapshot[] | null,
): DraftAccountRestore {
  if (platform !== "x") return { status: "recent", accountId: "" };
  const id = savedAccountId.trim();
  if (!id) return { status: "recent", accountId: "" };
  if (accounts === null) return { status: "pending" };
  const active = accounts.some(
    (account) => Boolean(account) && account.id === id && account.platform === "x" && account.status === "active",
  );
  if (active) return { status: "restored", accountId: id };
  return { status: "unavailable", accountId: "" };
}

export function draftAccountRestoreNotice(result: DraftAccountRestore): string | null {
  return result.status === "unavailable" ? PREVIOUS_ACCOUNT_UNAVAILABLE_NOTICE : null;
}

export type CampaignBrief = {
  name: string;
  description: string;
  price: string;
  url: string;
};

/** Optional brief stored on a reusable template. Missing keys mean "not saved", not "clear this field". */
export type StoredTemplateBrief = {
  productName?: string;
  productDescription?: string;
  productPrice?: string;
  productUrl?: string;
};

export function templateBriefFromCreate(brief: CampaignBrief): StoredTemplateBrief {
  return {
    productName: brief.name.trim(),
    productDescription: brief.description.trim(),
    productPrice: brief.price.trim(),
    productUrl: brief.url.trim(),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** History templates take the campaign name from the post and the other brief fields from contentPayload.brief. */
export function templateBriefFromScheduledPost(source: unknown): StoredTemplateBrief {
  const record = asRecord(source) ?? {};
  const brief = asRecord(asRecord(record.contentPayload)?.brief);
  const stored: StoredTemplateBrief = {};
  if (typeof record.productName === "string") stored.productName = record.productName.trim();
  if (brief && typeof brief.description === "string") stored.productDescription = brief.description.trim();
  if (brief && typeof brief.price === "string") stored.productPrice = brief.price.trim();
  if (brief && typeof brief.url === "string") stored.productUrl = brief.url.trim();
  return stored;
}

/** Copies only brief fields the template actually contains. Older templates leave the current brief as-is. */
export function applyTemplateBrief<T extends CampaignBrief>(current: T, template: StoredTemplateBrief): T {
  const next = { ...current };
  if (typeof template.productName === "string") next.name = template.productName;
  if (typeof template.productDescription === "string") next.description = template.productDescription;
  if (typeof template.productPrice === "string") next.price = template.productPrice;
  if (typeof template.productUrl === "string") next.url = template.productUrl;
  return next;
}
