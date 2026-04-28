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

export type ReusablePostTemplatesReadResult = {
  items: ReusablePostTemplate[];
  warning?: string;
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

export function readReusablePostTemplates(): ReusablePostTemplatesReadResult {
  if (typeof window === "undefined") return { items: [] };
  const raw = window.localStorage.getItem(REUSABLE_POST_TEMPLATES_STORAGE_KEY);
  if (!raw) return { items: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return {
        items: [],
        warning: "We couldn't read reusable templates (stored data is not in the expected format).",
      };
    }
    return { items: parsed as ReusablePostTemplate[] };
  } catch {
    return {
      items: [],
      warning: "We couldn't read reusable templates (stored data looks corrupted).",
    };
  }
}

export function upsertReusablePostTemplate(template: Omit<ReusablePostTemplate, "id" | "name" | "createdAt" | "updatedAt"> & { id?: string; name?: string }): ReusablePostTemplate {
  if (typeof window === "undefined") {
    throw new Error("localStorage is not available");
  }
  const existing = readReusablePostTemplates().items;
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
    window.localStorage.setItem(REUSABLE_POST_TEMPLATES_STORAGE_KEY, JSON.stringify(next));
    return nextItem;
  } catch {
    throw new Error("Could not save reusable template to localStorage");
  }
}

export function removeReusablePostTemplate(id: string): void {
  if (typeof window === "undefined") {
    throw new Error("localStorage is not available");
  }
  const next = readReusablePostTemplates().items.filter((item) => item.id !== id);
  try {
    window.localStorage.setItem(REUSABLE_POST_TEMPLATES_STORAGE_KEY, JSON.stringify(next));
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
