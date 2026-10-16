import { readPromiBrowserOwnerId } from "./browser-owner-id";
import { getClientPlanTier, getPlanConfig, isLimitReached } from "@/src/lib/plans/config";

type PublishPlatform = "x" | "instagram" | "facebook";

export type ReusablePostTemplate = {
  id: string;
  name: string;
  platform: PublishPlatform;
  channels: string[];
  tone?: string;
  angle?: string;
  instagramCaption: string;
  pinterestTitle: string;
  pinterestDescription: string;
  hashtags: string;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type ScheduledPostSource = {
  id: string;
  platform: PublishPlatform;
  channels: unknown;
  contentPayload: unknown;
  imageUrl: string | null;
  scheduledAt: string;
};

export const REUSABLE_POST_TEMPLATES_STORAGE_KEY = "promi-reusable-post-templates";
/** Set only after an owner-scoped copy has been written, so the legacy list is claimed once. */
const LEGACY_MIGRATED_TO_KEY = "promi-reusable-post-templates-migrated-to";

const INVALID_TEMPLATE_STORAGE_WARNING =
  "We couldn't read reusable templates (stored data is not in the expected format).";
const CORRUPT_TEMPLATE_STORAGE_WARNING =
  "We couldn't read reusable templates (stored data looks corrupted).";
const TEMPLATE_MOVE_FAILED_WARNING =
  "We couldn't move reusable templates to this account yet. They are still stored on this device.";

export type ReusablePostTemplatesReadResult = {
  items: ReusablePostTemplate[];
  warning?: string;
};

type LoadedTemplates = ReusablePostTemplatesReadResult & {
  legacyAdoptionPending: boolean;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readChannels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string");
}

function buildTemplateName(template: Pick<ReusablePostTemplate, "platform" | "instagramCaption" | "pinterestTitle" | "pinterestDescription">): string {
  const baseText =
    template.instagramCaption.trim()
    || template.pinterestTitle.trim()
    || template.pinterestDescription.trim()
    || "Reusable template";
  const trimmed = baseText.replace(/\s+/g, " ").trim();
  const short = trimmed.length <= 36 ? trimmed : `${trimmed.slice(0, 33)}...`;
  const platformLabel =
    template.platform === "x" ? "X" : template.platform === "instagram" ? "Instagram" : "Facebook";
  return `${platformLabel} - ${short}`;
}

function ownerScopedTemplatesKey(ownerId: string): string {
  return `${REUSABLE_POST_TEMPLATES_STORAGE_KEY}:${ownerId}`;
}

function currentTemplatesKey(): string {
  const ownerId = readPromiBrowserOwnerId();
  if (!ownerId) return REUSABLE_POST_TEMPLATES_STORAGE_KEY;
  return ownerScopedTemplatesKey(ownerId);
}

function parseTemplateList(raw: string | null): ReusablePostTemplatesReadResult {
  if (!raw?.trim()) return { items: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return { items: [], warning: INVALID_TEMPLATE_STORAGE_WARNING };
    return { items: parsed as ReusablePostTemplate[] };
  } catch {
    return { items: [], warning: CORRUPT_TEMPLATE_STORAGE_WARNING };
  }
}

/** Claim the legacy list for this owner only after the scoped copy is stored. */
function finishLegacyAdoption(ownerId: string): void {
  try {
    window.localStorage.setItem(LEGACY_MIGRATED_TO_KEY, ownerId);
  } catch {
    // The scoped copy is already stored. Removal below still prevents a second claim when it succeeds.
  }
  try {
    window.localStorage.removeItem(REUSABLE_POST_TEMPLATES_STORAGE_KEY);
  } catch {
    // If removal fails, the marker above blocks every other owner from copying the same list.
  }
}

function loadTemplates(): LoadedTemplates {
  if (typeof window === "undefined") return { items: [], legacyAdoptionPending: false };
  const ownerId = readPromiBrowserOwnerId();
  if (!ownerId) {
    return { ...parseTemplateList(window.localStorage.getItem(REUSABLE_POST_TEMPLATES_STORAGE_KEY)), legacyAdoptionPending: false };
  }

  const scopedKey = ownerScopedTemplatesKey(ownerId);
  const scopedRaw = window.localStorage.getItem(scopedKey);
  if (scopedRaw !== null && scopedRaw.trim() !== "") {
    return { ...parseTemplateList(scopedRaw), legacyAdoptionPending: false };
  }

  const migratedTo = window.localStorage.getItem(LEGACY_MIGRATED_TO_KEY)?.trim() ?? "";
  if (migratedTo && migratedTo !== ownerId) {
    return { items: [], legacyAdoptionPending: false };
  }

  const legacyRaw = window.localStorage.getItem(REUSABLE_POST_TEMPLATES_STORAGE_KEY);
  if (!legacyRaw?.trim()) return { items: [], legacyAdoptionPending: false };
  const legacy = parseTemplateList(legacyRaw);
  if (legacy.warning || legacy.items.length === 0) {
    return { ...legacy, legacyAdoptionPending: false };
  }

  try {
    window.localStorage.setItem(scopedKey, legacyRaw);
  } catch {
    return { items: legacy.items, warning: TEMPLATE_MOVE_FAILED_WARNING, legacyAdoptionPending: true };
  }
  finishLegacyAdoption(ownerId);
  return { items: legacy.items, legacyAdoptionPending: false };
}

function writeTemplates(items: ReusablePostTemplate[], legacyAdoptionPending: boolean): void {
  window.localStorage.setItem(currentTemplatesKey(), JSON.stringify(items));
  const ownerId = readPromiBrowserOwnerId();
  if (ownerId && legacyAdoptionPending) finishLegacyAdoption(ownerId);
}

export function readReusablePostTemplates(): ReusablePostTemplatesReadResult {
  if (typeof window === "undefined") return { items: [] };
  try {
    const loaded = loadTemplates();
    return { items: loaded.items, warning: loaded.warning };
  } catch {
    return { items: [], warning: CORRUPT_TEMPLATE_STORAGE_WARNING };
  }
}

export function upsertReusablePostTemplate(template: Omit<ReusablePostTemplate, "id" | "name" | "createdAt" | "updatedAt"> & { id?: string; name?: string }): ReusablePostTemplate {
  if (typeof window === "undefined") {
    throw new Error("localStorage is not available");
  }
  const loaded = loadTemplates();
  const existing = loaded.items;
  const now = new Date().toISOString();
  const id = template.id ?? crypto.randomUUID();
  const prev = existing.find((item) => item.id === id);
  if (!prev) {
    const plan = getPlanConfig(getClientPlanTier());
    if (isLimitReached(existing.length, plan.limits.reusableTemplates)) {
      throw new Error(`You reached the ${plan.label} limit of ${plan.limits.reusableTemplates} reusable templates.`);
    }
  }
  const nextItem: ReusablePostTemplate = {
    id,
    name: template.name?.trim() || buildTemplateName(template),
    platform: template.platform,
    channels: template.channels,
    tone: template.tone,
    angle: template.angle,
    instagramCaption: template.instagramCaption,
    pinterestTitle: template.pinterestTitle,
    pinterestDescription: template.pinterestDescription,
    hashtags: template.hashtags,
    imageUrl: template.imageUrl,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  const next =
    prev
      ? existing.map((item) => (item.id === id ? nextItem : item))
      : [...existing, nextItem];
  try {
    writeTemplates(next, loaded.legacyAdoptionPending);
    return nextItem;
  } catch {
    throw new Error("Could not save reusable template to localStorage");
  }
}

export function removeReusablePostTemplate(id: string): void {
  if (typeof window === "undefined") {
    throw new Error("localStorage is not available");
  }
  const loaded = loadTemplates();
  const next = loaded.items.filter((item) => item.id !== id);
  try {
    writeTemplates(next, loaded.legacyAdoptionPending);
  } catch {
    throw new Error("Could not update reusable templates in localStorage");
  }
}

function buildTemplateFromScheduledPost(source: ScheduledPostSource): Omit<ReusablePostTemplate, "id" | "name" | "createdAt" | "updatedAt"> {
  const payload = asObject(source.contentPayload) ?? {};
  const channels = readChannels(source.channels);
  return {
    platform: source.platform,
    channels,
    tone: readString(payload.tone).trim() || undefined,
    angle: readString(payload.angle).trim() || undefined,
    instagramCaption: readString(payload.instagramCaption).trim(),
    pinterestTitle: readString(payload.pinterestTitle).trim(),
    pinterestDescription: readString(payload.pinterestDescription).trim(),
    hashtags: readString(payload.hashtags).trim(),
    imageUrl: source.imageUrl?.trim() || null,
  };
}

export async function saveReusableTemplateFromScheduledPostId(scheduledPostId: string): Promise<{ template?: ReusablePostTemplate; error?: string }> {
  const id = scheduledPostId.trim();
  if (!id) return { error: "Missing scheduled post id." };
  try {
    const res = await fetch(`/api/scheduled-posts/${encodeURIComponent(id)}`, { cache: "no-store" });
    const body = (await res.json().catch(() => null)) as { data?: ScheduledPostSource; error?: string } | null;
    if (!res.ok || !body?.data) {
      return { error: body?.error ?? "Could not load source post for template." };
    }
    const templateInput = buildTemplateFromScheduledPost(body.data);
    const hasContent =
      Boolean(templateInput.instagramCaption)
      || Boolean(templateInput.pinterestTitle)
      || Boolean(templateInput.pinterestDescription)
      || Boolean(templateInput.hashtags);
    if (!hasContent) {
      return { error: "This post has no content to save as a reusable template." };
    }
    const template = upsertReusablePostTemplate(templateInput);
    return { template };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save reusable template right now." };
  }
}
