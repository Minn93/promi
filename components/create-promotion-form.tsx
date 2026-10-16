"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PreviewCard } from "@/components/preview-card";
import { getProductById, isSampleCatalogImageUrl, mockProducts } from "@/lib/mock-data";
import { readPromotions, upsertPromotion } from "@/lib/promotions-storage";
import { isTestOnlyPlatform, publishPlatformOptionLabel } from "@/lib/publish-platform-copy";
import { PUBLISHING_TIMING_NOTE } from "@/lib/publishing-timing-copy";
import { composeXPost, X_MAX_WEIGHTED_LENGTH, type ComposedXPost } from "@/src/lib/services/posts/publish-text";
import {
  readReusablePostTemplates,
  removeReusablePostTemplate,
  upsertReusablePostTemplate,
  type ReusablePostTemplate,
} from "@/lib/reusable-post-templates-storage";
import type { Product, Promotion } from "@/lib/types";
import { getClientPlanTier, getPlanConfig, limitLabel } from "@/src/lib/plans/config";
import {
  ALLOWED_IMAGE_EXTENSIONS,
  IMAGE_UPLOAD_MAX_BYTES,
  isAllowedImageByName,
  isAllowedImageMime,
  isUploadedScheduledImageUrl,
} from "@/src/lib/media/image-upload";
import { toUserFacingError } from "@/lib/user-facing-error";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const CHANNELS = [
  { id: "instagram" as const, label: "Instagram caption" },
  { id: "pinterest" as const, label: "Pinterest title & description" },
];

const TONES = [
  { id: "clean", label: "Clean & simple" },
  { id: "warm", label: "Warm & friendly" },
  { id: "sales", label: "Sales-focused" },
  { id: "elegant", label: "Elegant & minimal" },
] as const;

const ANGLES = [
  { id: "new_arrival", label: "New arrival" },
  { id: "best_seller", label: "Best seller" },
  { id: "limited", label: "Limited offer" },
  { id: "everyday", label: "Everyday essential" },
  { id: "gift", label: "Gift idea" },
] as const;

const REFRESH_EVENT = "promi:scheduled-posts-updated";

type ChannelId = (typeof CHANNELS)[number]["id"];
type PublishPlatform = "x" | "instagram" | "facebook";
type ConnectedAccount = {
  id: string;
  platform: PublishPlatform;
  status: "active" | "expired" | "revoked" | "error";
  displayName: string | null;
  externalAccountId: string | null;
};

type PromotionCopy = {
  instagramCaption: string;
  pinterestTitle: string;
  pinterestDescription: string;
  hashtags: string;
};

type UploadedImageMeta = {
  imageUrl: string;
  mimeType: string;
  size: number;
};
type PrefillMode = "duplicate" | "reschedule";
type ScheduledPostSource = {
  id: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  contentPayload: unknown;
  scheduledAt: string;
  platform: PublishPlatform;
  channels: unknown;
};

type ScheduledSuccess = {
  when: string;
  platform: PublishPlatform;
};

/**
 * What was last scheduled. The image is tracked separately because after success the selected file is cleared and
 * replaced by its uploaded URL, so the same image can be represented either way.
 */
type ScheduledFingerprint = {
  content: string;
  imageKeys: string[];
};

function fileImageKey(file: File): string {
  return `file:${file.name}:${file.size}:${file.lastModified}`;
}

type ImageUploadResult = { ok: true; data: UploadedImageMeta } | { ok: false; message: string };

async function uploadScheduledImage(file: File): Promise<ImageUploadResult> {
  const formData = new FormData();
  formData.set("image", file);
  const uploadRes = await fetch("/api/uploads/scheduled-image", {
    method: "POST",
    body: formData,
  });
  const uploadBody = (await uploadRes.json().catch(() => null)) as { data?: UploadedImageMeta; error?: string; details?: string } | null;
  if (!uploadRes.ok || !uploadBody?.data?.imageUrl) {
    return { ok: false, message: uploadBody?.error || uploadBody?.details || "Could not upload image." };
  }
  return { ok: true, data: uploadBody.data };
}

const DRAFT_IMAGE_UPLOAD_FAILED =
  "We couldn't upload your image, so the draft wasn't saved. Try again, or remove the image to save without it.";

function buildXPost(copy: PromotionCopy, url: string): ComposedXPost {
  return composeXPost({
    instagramCaption: copy.instagramCaption,
    pinterestTitle: copy.pinterestTitle,
    pinterestDescription: copy.pinterestDescription,
    hashtags: copy.hashtags,
    brief: { url },
  });
}

function generateErrorMessage(status: number, code: string | undefined): string {
  if (status === 401 || code === "authentication_required") {
    return "Your session has expired. Sign in again, then generate your post.";
  }
  if (status === 429 || code === "too_many_requests") {
    return "You've generated several posts in a short time. Wait a minute, then try again.";
  }
  if (code === "email_verification_required") {
    return "Verify your email address to generate posts. Check your inbox for the verification email, or contact Promi support if you can't find it.";
  }
  if (code === "account_unavailable") {
    return "This account can't generate posts right now. Contact Promi support.";
  }
  if (status === 503 || code === "service_unavailable") {
    return "Post generation is temporarily unavailable. Try again in a few minutes.";
  }
  if (status === 400) {
    return "Something was missing from this request. Reload the page and try again.";
  }
  return "We couldn't generate a post right now. Please try again.";
}

const BRIEF_LIMITS = { name: 80, description: 600, price: 40, url: 300 } as const;

/** The editable "What are you promoting?" fields. */
type Brief = { name: string; description: string; price: string; url: string };
type BriefErrors = Partial<Record<keyof Brief, string>>;

const EMPTY_BRIEF: Brief = { name: "", description: "", price: "", url: "" };

/** What the post promotes: a sample product, a user-entered brief, or a brief restored from a draft or earlier post. */
type PromotionSubject = {
  kind: "catalog" | "custom" | "reused";
  id: string;
  name: string;
  description: string;
  price: string;
  image: string | null;
  url: string | null;
};

/** Identity carried over from a sample product, saved draft, or source post; kept while the name is unchanged. */
type SubjectBase = { kind: "catalog" | "reused"; id: string; name: string; image: string | null };

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** FNV-1a (32-bit). */
function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Name and description together, so different campaigns that share a name get different ids. */
function customSubjectId(name: string, description: string): string {
  return `custom-${hashString(`${normalizeText(name)}\n${normalizeText(description)}`)}`;
}

function catalogProductUrl(product: Product): string {
  return product.productUrl && product.productUrl !== "#" ? product.productUrl : "";
}

function briefFromProduct(product: Product): Brief {
  return {
    name: product.name,
    description: product.description,
    price: usd.format(product.price),
    url: catalogProductUrl(product),
  };
}

function catalogBase(product: Product): SubjectBase {
  return { kind: "catalog", id: product.id, name: product.name, image: product.image };
}

function deriveSubject(brief: Brief, base: SubjectBase | null): PromotionSubject {
  const name = brief.name.trim();
  const description = brief.description.trim();
  const shared = { name, description, price: brief.price.trim(), url: brief.url.trim() || null };
  if (base && normalizeText(base.name) === normalizeText(name)) {
    return { ...shared, kind: base.kind, id: base.id, image: base.image };
  }
  return { ...shared, kind: "custom", id: customSubjectId(name, description), image: null };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateBrief(brief: Brief): BriefErrors {
  const errors: BriefErrors = {};
  const name = brief.name.trim();
  if (!name) errors.name = "Add a product or campaign name.";
  else if (name.length > BRIEF_LIMITS.name) errors.name = `Keep the name to ${BRIEF_LIMITS.name} characters or fewer.`;
  const description = brief.description.trim();
  if (!description) errors.description = "Add a few details so Promi can write your post.";
  else if (description.length > BRIEF_LIMITS.description) {
    errors.description = `Keep the details to ${BRIEF_LIMITS.description} characters or fewer.`;
  }
  if (brief.price.trim().length > BRIEF_LIMITS.price) {
    errors.price = `Keep the price or offer to ${BRIEF_LIMITS.price} characters or fewer.`;
  }
  const url = brief.url.trim();
  if (url.length > BRIEF_LIMITS.url) errors.url = `Keep the link to ${BRIEF_LIMITS.url} characters or fewer.`;
  else if (url && !isHttpUrl(url)) errors.url = "Enter a full link that starts with http:// or https://.";
  return errors;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readSourceChannels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string");
}

function resolveToneId(value: unknown): (typeof TONES)[number]["id"] | null {
  const raw = readString(value).trim().toLowerCase();
  if (!raw) return null;
  const byId = TONES.find((item) => item.id.toLowerCase() === raw);
  if (byId) return byId.id;
  const byLabel = TONES.find((item) => item.label.toLowerCase() === raw);
  return byLabel?.id ?? null;
}

function resolveAngleId(value: unknown): (typeof ANGLES)[number]["id"] | null {
  const raw = readString(value).trim().toLowerCase();
  if (!raw) return null;
  const byId = ANGLES.find((item) => item.id.toLowerCase() === raw);
  if (byId) return byId.id;
  const byLabel = ANGLES.find((item) => item.label.toLowerCase() === raw);
  return byLabel?.id ?? null;
}

function platformLabel(platform: PublishPlatform): string {
  if (platform === "x") return "X";
  if (platform === "instagram") return "Instagram";
  return "Facebook";
}

function combineLocalDateTime(date: string, time: string): string | null {
  if (!date.trim() || !time.trim()) return null;
  const d = new Date(`${date}T${time}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Values for `<input type="date">` and `<input type="time">` in local time. */
function splitLocalDateTime(iso: string | null): { date: string; time: string } {
  if (!iso?.trim()) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return { date: `${y}-${m}-${day}`, time: `${h}:${min}` };
}

function formatAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

const FIELD_FOCUS =
  "focus-visible:outline-none focus-visible:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-400/20 focus-visible:ring-offset-0 dark:focus-visible:border-zinc-500 dark:focus-visible:ring-zinc-500/15";
const BUTTON_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-zinc-500/40 dark:focus-visible:ring-offset-zinc-950";

const TEXT_FIELD_BASE = `w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-800 placeholder:text-zinc-400 transition-[border-color,box-shadow] duration-200 ${FIELD_FOCUS} dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:placeholder:text-zinc-500`;

const DATE_TIME_FIELD = `rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 transition-[border-color,box-shadow] duration-200 ${FIELD_FOCUS} dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100`;

const BTN_PRIMARY =
  `promi-press inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-[background-color,box-shadow,transform,opacity] duration-200 ease-out hover:bg-zinc-950 hover:shadow-md hover:shadow-zinc-900/35 enabled:active:scale-[0.98] motion-safe:enabled:active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:hover:shadow-zinc-900/12 dark:enabled:active:bg-zinc-200 ${BUTTON_FOCUS}`;

const BTN_PRIMARY_SM =
  `promi-press inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-[background-color,box-shadow,transform,opacity] duration-200 ease-out hover:bg-zinc-950 hover:shadow-md hover:shadow-zinc-900/35 enabled:active:scale-[0.98] motion-safe:enabled:active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:hover:shadow-zinc-900/12 dark:enabled:active:bg-zinc-200 ${BUTTON_FOCUS}`;

const BTN_SECONDARY =
  `promi-press inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-[background-color,box-shadow,transform,border-color,opacity] duration-200 ease-out hover:border-zinc-400 hover:bg-zinc-100 hover:shadow-sm hover:shadow-zinc-900/[0.06] enabled:active:scale-[0.98] motion-safe:enabled:active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:border-zinc-500 dark:hover:bg-zinc-900 dark:hover:shadow-black/25 ${BUTTON_FOCUS}`;
const BTN_LOCKED =
  `inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 ${BUTTON_FOCUS}`;

const CHOICE_RING =
  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-zinc-400/30 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-white dark:has-[:focus-visible]:ring-zinc-500/35 dark:has-[:focus-visible]:ring-offset-zinc-950";

function InlineSpinner() {
  return (
    <span
      className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current opacity-90"
      aria-hidden
    />
  );
}

function buildPromotionPayload(
  subject: PromotionSubject,
  /** Uploaded image URL, sample image, or null. Never file data. */
  image: string | null,
  toneLabel: string,
  angleLabel: string,
  channelIds: string[],
  copy: PromotionCopy,
  scheduledAt: string | null,
  existingId?: string,
): Promotion {
  return {
    id: existingId ?? crypto.randomUUID(),
    productId: subject.id,
    productName: subject.name,
    productImage: image ?? "",
    imageRefs: image ? [image] : [],
    source: subject.kind === "catalog" ? "catalog" : "custom",
    productDescription: subject.description,
    productPrice: subject.price,
    productUrl: subject.url ?? "",
    channels: channelIds,
    tone: toneLabel,
    angle: angleLabel,
    instagramCaption: copy.instagramCaption,
    pinterestTitle: copy.pinterestTitle,
    pinterestDescription: copy.pinterestDescription,
    hashtags: copy.hashtags,
    scheduledAt,
    status: "draft",
  };
}

type CreatePromotionFormProps = {
  /** Sample product used to prefill the brief; null when the user enters their own. */
  product: Product | null;
  /** True when `productId` was in the URL but did not match any sample product. */
  invalidProductId?: boolean;
  /** When set, load this saved promotion from localStorage and pre-fill the form. */
  promotionId?: string;
  /** When set, prefill from an existing scheduled post. */
  sourcePostId?: string;
  /** Indicates whether source prefill is duplicate or reschedule flow. */
  prefillMode?: PrefillMode;
  /** When set, prefill from a saved reusable template. */
  templateId?: string;
};

export function CreatePromotionForm({
  product,
  invalidProductId,
  promotionId,
  sourcePostId,
  prefillMode,
  templateId,
}: CreatePromotionFormProps) {
  const generateInFlightRef = useRef(false);
  const persistInFlightRef = useRef(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [brief, setBrief] = useState<Brief>(() => (product ? briefFromProduct(product) : EMPTY_BRIEF));
  const [subjectBase, setSubjectBase] = useState<SubjectBase | null>(() => (product ? catalogBase(product) : null));
  const [showUnknownProductNotice, setShowUnknownProductNotice] = useState(Boolean(invalidProductId));
  const [channels, setChannels] = useState<Record<ChannelId, boolean>>({
    instagram: true,
    pinterest: true,
  });
  const [tone, setTone] = useState<(typeof TONES)[number]["id"]>("clean");
  const [angle, setAngle] = useState<(typeof ANGLES)[number]["id"]>("new_arrival");
  const [instagramCaption, setInstagramCaption] = useState("");
  const [pinterestTitle, setPinterestTitle] = useState("");
  const [pinterestDescription, setPinterestDescription] = useState("");
  const [hashtags, setHashtags] = useState("");
  /** Always mirrors the latest draft fields so save handlers never read stale state. */
  const copyRef = useRef<PromotionCopy>({
    instagramCaption: "",
    pinterestTitle: "",
    pinterestDescription: "",
    hashtags: "",
  });
  copyRef.current = {
    instagramCaption,
    pinterestTitle,
    pinterestDescription,
    hashtags,
  };
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [publishPlatform, setPublishPlatform] = useState<PublishPlatform>("x");
  const [accountId, setAccountId] = useState("");
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [scheduledFingerprint, setScheduledFingerprint] = useState<ScheduledFingerprint | null>(null);
  const [draftId, setDraftId] = useState<string | null>(promotionId?.trim() || null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImagePreviewUrl, setSelectedImagePreviewUrl] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<UploadedImageMeta | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [persistKind, setPersistKind] = useState<null | "draft" | "schedule">(null);
  const [generateSuccess, setGenerateSuccess] = useState(false);
  const [sourcePrefill, setSourcePrefill] = useState<ScheduledPostSource | null>(null);
  const [sourcePrefillError, setSourcePrefillError] = useState<string | null>(null);
  const [sourcePrefillLoading, setSourcePrefillLoading] = useState(false);
  const [templates, setTemplates] = useState<ReusablePostTemplate[]>([]);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const [activeScheduledCount, setActiveScheduledCount] = useState<number | null>(null);
  const [scheduleErrorCode, setScheduleErrorCode] = useState<string | null>(null);
  const [scheduledSuccess, setScheduledSuccess] = useState<ScheduledSuccess | null>(null);
  const subject = deriveSubject(brief, subjectBase);
  const briefErrors = validateBrief(brief);
  const briefReadyForGenerate = Object.keys(briefErrors).length === 0;
  /** Description is only required to generate; saving or scheduling existing copy needs just a valid name. */
  const briefSaveError =
    briefErrors.name
    ?? briefErrors.price
    ?? briefErrors.url
    ?? (brief.description.trim() ? briefErrors.description : undefined);
  const planTier = getClientPlanTier();
  const plan = getPlanConfig(planTier);
  const templateLimitReached = templates.length >= plan.limits.reusableTemplates;
  const scheduledLimitReached =
    activeScheduledCount != null && activeScheduledCount >= plan.limits.scheduledPostsActive;

  const refreshTemplates = () => {
    const result = readReusablePostTemplates();
    setTemplates(result.items);
    setTemplateError(result.warning ?? null);
  };

  const applyTemplate = (template: ReusablePostTemplate) => {
    const nextCopy: PromotionCopy = {
      instagramCaption: template.instagramCaption,
      pinterestTitle: template.pinterestTitle,
      pinterestDescription: template.pinterestDescription,
      hashtags: template.hashtags,
    };
    copyRef.current = nextCopy;
    setInstagramCaption(nextCopy.instagramCaption);
    setPinterestTitle(nextCopy.pinterestTitle);
    setPinterestDescription(nextCopy.pinterestDescription);
    setHashtags(nextCopy.hashtags);

    const nextChannels: Record<ChannelId, boolean> = {
      instagram: template.channels.includes("instagram") || Boolean(nextCopy.instagramCaption),
      pinterest:
        template.channels.includes("pinterest")
        || Boolean(nextCopy.pinterestTitle)
        || Boolean(nextCopy.pinterestDescription),
    };
    if (nextChannels.instagram || nextChannels.pinterest) {
      setChannels(nextChannels);
    }

    const toneId = resolveToneId(template.tone);
    if (toneId) setTone(toneId);
    const angleId = resolveAngleId(template.angle);
    if (angleId) setAngle(angleId);

    setPublishPlatform(template.platform);
    setAccountId("");
    setScheduleDate("");
    setScheduleTime("");
    setGenerateError(null);
    setScheduleError(null);
    if (template.imageUrl && isUploadedScheduledImageUrl(template.imageUrl)) {
      setUploadedImage({
        imageUrl: template.imageUrl,
        mimeType: "image/*",
        size: 0,
      });
    } else {
      setUploadedImage(null);
    }
    setTemplateNotice(`Template "${template.name}" applied. Choose a future date/time before scheduling.`);
  };

  useEffect(() => {
    if (!generateSuccess) return;
    const id = window.setTimeout(() => setGenerateSuccess(false), 4200);
    return () => window.clearTimeout(id);
  }, [generateSuccess]);

  useEffect(() => {
    if (!selectedImage) {
      setSelectedImagePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(selectedImage);
    setSelectedImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedImage]);

  useEffect(() => {
    refreshTemplates();
  }, []);

  useEffect(() => {
    const id = sourcePostId?.trim();
    if (!id) return;
    let cancelled = false;
    const run = async () => {
      setSourcePrefillError(null);
      setSourcePrefillLoading(true);
      try {
        const res = await fetch(`/api/scheduled-posts/${encodeURIComponent(id)}`, { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as { data?: ScheduledPostSource; error?: string } | null;
        if (!res.ok || !body?.data) {
          if (!cancelled) {
            setSourcePrefill(null);
            setSourcePrefillError(body?.error ?? "Could not load source post data.");
          }
          return;
        }
        if (!cancelled) setSourcePrefill(body.data);
      } catch {
        if (!cancelled) {
          setSourcePrefill(null);
          setSourcePrefillError("Could not load source post data.");
        }
      } finally {
        if (!cancelled) setSourcePrefillLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [sourcePostId]);

  useEffect(() => {
    const id = promotionId?.trim();
    if (!id) return;
    const saved = readPromotions().items.find((p) => p.id === id);
    if (!saved) return;
    setDraftId(saved.id);

    // Drafts saved before 15.2B have no brief fields; sample-product drafts fall back to the catalog entry.
    const sample = getProductById(saved.productId) ?? null;
    setSubjectBase(
      sample
        ? catalogBase(sample)
        : {
            kind: "reused",
            id: saved.productId,
            name: saved.productName,
            image: isSampleCatalogImageUrl(saved.productImage) ? saved.productImage : null,
          },
    );
    setBrief({
      name: saved.productName,
      description: saved.productDescription ?? sample?.description ?? "",
      price: saved.productPrice ?? (sample ? usd.format(sample.price) : ""),
      url: saved.productUrl ?? (sample ? catalogProductUrl(sample) : ""),
    });
    setShowUnknownProductNotice(false);
    if (isUploadedScheduledImageUrl(saved.productImage)) {
      setUploadedImage({ imageUrl: saved.productImage, mimeType: "image/*", size: 0 });
    }

    const nextChannels: Record<ChannelId, boolean> = {
      instagram: saved.channels.includes("instagram"),
      pinterest: saved.channels.includes("pinterest"),
    };
    setChannels(nextChannels);

    const toneMatch = TONES.find((t) => t.label === saved.tone);
    if (toneMatch) setTone(toneMatch.id);
    const angleMatch = ANGLES.find((a) => a.label === saved.angle);
    if (angleMatch) setAngle(angleMatch.id);

    const nextCopy: PromotionCopy = {
      instagramCaption: saved.instagramCaption,
      pinterestTitle: saved.pinterestTitle,
      pinterestDescription: saved.pinterestDescription,
      hashtags: saved.hashtags,
    };
    copyRef.current = nextCopy;
    setInstagramCaption(nextCopy.instagramCaption);
    setPinterestTitle(nextCopy.pinterestTitle);
    setPinterestDescription(nextCopy.pinterestDescription);
    setHashtags(nextCopy.hashtags);

    const { date, time } = splitLocalDateTime(saved.scheduledAt);
    setScheduleDate(date);
    setScheduleTime(time);
  }, [promotionId]);

  useEffect(() => {
    if (!sourcePrefill) return;
    const payload = asObject(sourcePrefill.contentPayload) ?? {};

    const sourceBrief = asObject(payload.brief);
    const sample = getProductById(sourcePrefill.productId) ?? null;
    setSubjectBase(
      sample
        ? catalogBase(sample)
        : {
            kind: "reused",
            id: sourcePrefill.productId,
            name: sourcePrefill.productName,
            image: isSampleCatalogImageUrl(sourcePrefill.imageUrl) ? sourcePrefill.imageUrl : null,
          },
    );
    setBrief({
      name: sourcePrefill.productName,
      description: readString(sourceBrief?.description).trim() || sample?.description || "",
      price: readString(sourceBrief?.price).trim() || (sample ? usd.format(sample.price) : ""),
      url: readString(sourceBrief?.url).trim() || (sample ? catalogProductUrl(sample) : ""),
    });
    setShowUnknownProductNotice(false);

    const nextCopy: PromotionCopy = {
      instagramCaption: readString(payload.instagramCaption).trim(),
      pinterestTitle: readString(payload.pinterestTitle).trim(),
      pinterestDescription: readString(payload.pinterestDescription).trim(),
      hashtags: readString(payload.hashtags).trim(),
    };
    copyRef.current = nextCopy;
    setInstagramCaption(nextCopy.instagramCaption);
    setPinterestTitle(nextCopy.pinterestTitle);
    setPinterestDescription(nextCopy.pinterestDescription);
    setHashtags(nextCopy.hashtags);

    const toneId = resolveToneId(payload.tone);
    if (toneId) setTone(toneId);
    const angleId = resolveAngleId(payload.angle);
    if (angleId) setAngle(angleId);

    const sourceChannels = readSourceChannels(sourcePrefill.channels);
    const nextChannels: Record<ChannelId, boolean> = {
      instagram: sourceChannels.includes("instagram") || Boolean(nextCopy.instagramCaption),
      pinterest:
        sourceChannels.includes("pinterest")
        || Boolean(nextCopy.pinterestTitle)
        || Boolean(nextCopy.pinterestDescription),
    };
    if (nextChannels.instagram || nextChannels.pinterest) {
      setChannels(nextChannels);
    }

    setPublishPlatform(sourcePrefill.platform);
    setAccountId("");
    setGenerateError(null);
    setScheduleError(null);
    setSaveNotice(
      prefillMode === "reschedule"
        ? "Reschedule mode: copied content and platform. Choose a new future date and time before scheduling."
        : "Duplicate mode: copied content and platform. Update anything before saving or scheduling.",
    );

    if (sourcePrefill.imageUrl && isUploadedScheduledImageUrl(sourcePrefill.imageUrl)) {
      setUploadedImage({
        imageUrl: sourcePrefill.imageUrl,
        mimeType: "image/*",
        size: 0,
      });
    }

    if (prefillMode === "reschedule") {
      setScheduleDate("");
      setScheduleTime("");
      return;
    }

    const sourceDate = new Date(sourcePrefill.scheduledAt);
    if (!Number.isNaN(sourceDate.getTime()) && sourceDate.getTime() > Date.now()) {
      const { date, time } = splitLocalDateTime(sourcePrefill.scheduledAt);
      setScheduleDate(date);
      setScheduleTime(time);
      return;
    }
    setScheduleDate("");
    setScheduleTime("");
  }, [sourcePrefill, prefillMode]);

  useEffect(() => {
    const id = templateId?.trim();
    if (!id) return;
    const match = templates.find((item) => item.id === id);
    if (!match) return;
    applyTemplate(match);
  }, [templateId, templates]);

  const loadConnectedAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/connected-accounts", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { data?: ConnectedAccount[] } | null;
      if (!res.ok) return;
      setConnectedAccounts(Array.isArray(body?.data) ? body.data : []);
      setAccountsLoaded(true);
    } catch {
      // Guidance only; scheduling does not depend on this list.
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void loadConnectedAccounts(), 0);
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadConnectedAccounts();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadConnectedAccounts]);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/scheduled-posts?summary=active_count", { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as { data?: { activeScheduledPosts?: number } } | null;
        if (!res.ok) return;
        const count = body?.data?.activeScheduledPosts;
        if (typeof count === "number" && Number.isFinite(count)) setActiveScheduledCount(count);
      } catch {
        // optional usage indicator only
      }
    };
    void run();
  }, []);

  const toggleChannel = (id: ChannelId) => {
    setChannels((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleGenerate = async () => {
    if (generateInFlightRef.current || persistInFlightRef.current) return;
    if (!briefReadyForGenerate) {
      setGenerateError("Add a name and a few details under What are you promoting?, then generate.");
      return;
    }

    const selectedChannels = CHANNELS.filter(({ id }) => channels[id]).map(({ id }) => id);
    if (selectedChannels.length === 0) {
      setGenerateError("Select at least one copy format, then generate content.");
      return;
    }

    const toneLabel = TONES.find((t) => t.id === tone)?.label ?? tone;
    const angleLabel = ANGLES.find((a) => a.id === angle)?.label ?? angle;

    setGenerateError(null);
    setScheduleError(null);
    setSaveNotice(null);
    setGenerateSuccess(false);
    setIsGenerating(true);
    generateInFlightRef.current = true;
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: subject.name,
          productDescription: subject.description,
          productPrice: subject.price || "Not specified",
          tone: toneLabel,
          promotionAngle: angleLabel,
          selectedChannels,
        }),
      });

      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        const errBody = data as { error?: string } | null;
        setGenerateError(generateErrorMessage(res.status, typeof errBody?.error === "string" ? errBody.error : undefined));
        return;
      }

      const payload = data as Partial<PromotionCopy> | null;
      const next: PromotionCopy = {
        instagramCaption: String(payload?.instagramCaption ?? "").trim(),
        pinterestTitle: String(payload?.pinterestTitle ?? "").trim(),
        pinterestDescription: String(payload?.pinterestDescription ?? "").trim(),
        hashtags: String(payload?.hashtags ?? "").trim(),
      };
      copyRef.current = next;
      
      setInstagramCaption(next.instagramCaption);
      setPinterestTitle(next.pinterestTitle);
      setPinterestDescription(next.pinterestDescription);
      setHashtags(next.hashtags);
      setGenerateSuccess(true);
    } catch {
      setGenerateError("Something went wrong. Check your connection and try again.");
    } finally {
      generateInFlightRef.current = false;
      setIsGenerating(false);
    }
  };

  const persistDraft = (scheduledAt: string | null, image: string | null) => {
    const channelIds = CHANNELS.filter(({ id }) => channels[id]).map(({ id }) => id);
    const tl = TONES.find((t) => t.id === tone)?.label ?? tone;
    const al = ANGLES.find((a) => a.id === angle)?.label ?? angle;
    const record = buildPromotionPayload(
      subject,
      image,
      tl,
      al,
      channelIds,
      copyRef.current,
      scheduledAt,
      draftId ?? undefined,
    );
    try {
      upsertPromotion(record);
      setDraftId(record.id);
      setScheduleError(null);
      setSaveNotice("Draft saved on this device.");
    } catch {
      setSaveNotice(null);
      setScheduleError(
        "Could not save this promotion on this device. Check your browser storage and try again.",
      );
    }
  };

  const handleSaveDraft = async () => {
    if (persistKind || isGenerating || persistInFlightRef.current) return;
    setSaveNotice(null);
    setScheduledSuccess(null);
    setGenerateError(null);
    setScheduleErrorCode(null);
    if (briefSaveError) {
      setScheduleError(`${briefSaveError} (See What are you promoting?)`);
      return;
    }
    setScheduleError(null);
    setPersistKind("draft");
    persistInFlightRef.current = true;
    try {
      let image = uploadedImage?.imageUrl ?? subject.image ?? null;
      if (selectedImage) {
        let upload: ImageUploadResult;
        try {
          upload = await uploadScheduledImage(selectedImage);
        } catch {
          upload = { ok: false, message: DRAFT_IMAGE_UPLOAD_FAILED };
        }
        if (!upload.ok) {
          setScheduleError(DRAFT_IMAGE_UPLOAD_FAILED);
          return;
        }
        setUploadedImage(upload.data);
        setSelectedImage(null);
        if (imageInputRef.current) imageInputRef.current.value = "";
        image = upload.data.imageUrl;
      }
      persistDraft(combineLocalDateTime(scheduleDate, scheduleTime), image);
    } finally {
      persistInFlightRef.current = false;
      window.setTimeout(() => setPersistKind(null), 220);
    }
  };

  const currentScheduleSignature = () =>
    JSON.stringify({
      instagramCaption: copyRef.current.instagramCaption,
      pinterestTitle: copyRef.current.pinterestTitle,
      pinterestDescription: copyRef.current.pinterestDescription,
      hashtags: copyRef.current.hashtags,
      url: subject.url ?? "",
      scheduleDate,
      scheduleTime,
      publishPlatform,
      accountId,
    });

  const currentImageKey = () =>
    selectedImage ? fileImageKey(selectedImage) : `url:${uploadedImage?.imageUrl ?? subject.image ?? ""}`;

  const matchesScheduledFingerprint = () =>
    scheduledFingerprint !== null
    && scheduledFingerprint.content === currentScheduleSignature()
    && scheduledFingerprint.imageKeys.includes(currentImageKey());

  const handleStartAnother = () => {
    const empty: PromotionCopy = { instagramCaption: "", pinterestTitle: "", pinterestDescription: "", hashtags: "" };
    copyRef.current = empty;
    setInstagramCaption("");
    setPinterestTitle("");
    setPinterestDescription("");
    setHashtags("");
    setScheduleDate("");
    setScheduleTime("");
    setSelectedImage(null);
    setUploadedImage(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
    setScheduledSuccess(null);
    setScheduledFingerprint(null);
    setSaveNotice(null);
    setScheduleError(null);
    setScheduleErrorCode(null);
    setGenerateError(null);
    setTemplateNotice(null);
    setDraftId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSchedulePromotion = async () => {
    if (persistKind || isGenerating || persistInFlightRef.current) {
      return;
    }
    if (matchesScheduledFingerprint()) return;
    const contentSignature = currentScheduleSignature();
    const submittedImageKey = currentImageKey();
    setSaveNotice(null);
    setScheduledSuccess(null);
    setGenerateError(null);
    setScheduleErrorCode(null);
    if (briefSaveError) {
      setScheduleError(`${briefSaveError} (See What are you promoting?)`);
      return;
    }
    if (!scheduleDate.trim() || !scheduleTime.trim()) {
      setScheduleError("Choose a date and time before scheduling.");
      return;
    }
    const scheduledAt = combineLocalDateTime(scheduleDate, scheduleTime);
    if (!scheduledAt) {
      setScheduleError("We could not read that date and time. Try again.");
      return;
    }
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      setScheduleError("Choose a future date and time for scheduling.");
      return;
    }
    const xPost = buildXPost(copyRef.current, subject.url ?? "");
    if (publishPlatform === "x" && xPost.weightedLength > X_MAX_WEIGHTED_LENGTH) {
      setScheduleError(`X post text is too long (${xPost.weightedLength}/${X_MAX_WEIGHTED_LENGTH}). Shorten your copy before scheduling.`);
      return;
    }

    setScheduleError(null);
    setScheduleErrorCode(null);
    setPersistKind("schedule");
    persistInFlightRef.current = true;
    const selectedChannels = CHANNELS.filter(({ id }) => channels[id]).map(({ id }) => id);
    const tl = TONES.find((t) => t.id === tone)?.label ?? tone;
    const al = ANGLES.find((a) => a.id === angle)?.label ?? angle;

    try {
      let imageUrl: string | null = subject.image;
      if (selectedImage) {
        const upload = await uploadScheduledImage(selectedImage);
        if (!upload.ok) {
          setScheduleError(upload.message);
          return;
        }
        setUploadedImage(upload.data);
        setSelectedImage(null);
        if (imageInputRef.current) imageInputRef.current.value = "";
        imageUrl = upload.data.imageUrl;
      } else if (uploadedImage?.imageUrl) {
        imageUrl = uploadedImage.imageUrl;
      }

      const res = await fetch("/api/scheduled-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: subject.id,
          productName: subject.name,
          imageUrl,
          channels: selectedChannels,
          contentPayload: {
            tone: tl,
            angle: al,
            instagramCaption: copyRef.current.instagramCaption,
            pinterestTitle: copyRef.current.pinterestTitle,
            pinterestDescription: copyRef.current.pinterestDescription,
            hashtags: copyRef.current.hashtags,
            brief: {
              description: subject.description,
              price: subject.price,
              url: subject.url ?? "",
              source: subject.kind === "catalog" ? "catalog" : "custom",
            },
          },
          scheduledAt,
          platform: publishPlatform,
          accountId: accountId || null,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; details?: string; code?: string } | null;
      if (!res.ok) {
        const mapped = toUserFacingError(body?.code ?? null, body?.error || body?.details || "Could not schedule this promotion right now.");
        setScheduleError(mapped.message);
        setScheduleErrorCode(body?.code ?? null);
        setScheduledSuccess(null);
        return;
      }
      const scheduledLabel = new Date(scheduledAt).toLocaleString();
      setScheduledSuccess({ when: scheduledLabel, platform: publishPlatform });
      setScheduledFingerprint({ content: contentSignature, imageKeys: [submittedImageKey, `url:${imageUrl ?? ""}`] });
      setScheduleErrorCode(null);
      setActiveScheduledCount((prev) => (typeof prev === "number" ? prev + 1 : prev));
      setSelectedImage(null);
      window.dispatchEvent(new Event(REFRESH_EVENT));
    } catch (err) {
      console.error("[schedule] schedule failed:", err);
      setScheduleError("Could not schedule this promotion right now.");
      setScheduleErrorCode(null);
      setScheduledSuccess(null);
    } finally {
      persistInFlightRef.current = false;
      window.setTimeout(() => setPersistKind(null), 220);
    }
  };

  const handleImageChange = (file: File | null) => {
    if (!file) {
      setSelectedImage(null);
      return;
    }
    if (!isAllowedImageByName(file.name) || !isAllowedImageMime(file.type)) {
      setScheduleError(`Only ${Array.from(ALLOWED_IMAGE_EXTENSIONS).join(", ")} images are supported.`);
      return;
    }
    if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
      setScheduleError(`Image must be ${Math.floor(IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024))}MB or smaller.`);
      return;
    }
    setScheduleError(null);
    setSelectedImage(file);
    setUploadedImage(null);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setUploadedImage(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
    setScheduleError(null);
  };

  const handleSaveTemplate = () => {
    const hasContent =
      Boolean(copyRef.current.instagramCaption.trim())
      || Boolean(copyRef.current.pinterestTitle.trim())
      || Boolean(copyRef.current.pinterestDescription.trim())
      || Boolean(copyRef.current.hashtags.trim());
    if (!hasContent) {
      setTemplateError("Add some content before saving a reusable template.");
      return;
    }
    const selectedChannels = CHANNELS.filter(({ id }) => channels[id]).map(({ id }) => id);
    const toneLabel = TONES.find((item) => item.id === tone)?.label ?? tone;
    const angleLabel = ANGLES.find((item) => item.id === angle)?.label ?? angle;
    try {
      const saved = upsertReusablePostTemplate({
        platform: publishPlatform,
        channels: selectedChannels,
        tone: toneLabel,
        angle: angleLabel,
        instagramCaption: copyRef.current.instagramCaption.trim(),
        pinterestTitle: copyRef.current.pinterestTitle.trim(),
        pinterestDescription: copyRef.current.pinterestDescription.trim(),
        hashtags: copyRef.current.hashtags.trim(),
        imageUrl: uploadedImage?.imageUrl ?? subject.image ?? null,
      });
      setTemplateError(null);
      setTemplateNotice(`Saved reusable template: ${saved.name}`);
      refreshTemplates();
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Could not save reusable template on this device.");
    }
  };

  const handleRemoveTemplate = (id: string) => {
    if (!window.confirm("Remove this template? This cannot be undone.")) return;
    try {
      removeReusablePostTemplate(id);
      refreshTemplates();
      setTemplateNotice("Template removed.");
      setTemplateError(null);
    } catch {
      setTemplateError("Could not remove reusable template.");
    }
  };

  const previewCaption = instagramCaption || "Caption preview";
  const previewPinTitle = pinterestTitle || "Pin title preview";
  const previewPinDesc = pinterestDescription || "Pin description preview";
  const hasGenerated = Boolean(
    instagramCaption || pinterestTitle || pinterestDescription || hashtags,
  );

  const toneLabel = TONES.find((t) => t.id === tone)?.label;
  const angleLabel = ANGLES.find((a) => a.id === angle)?.label;
  const hasSelectedChannel = CHANNELS.some(({ id }) => channels[id]);
  const accountsForPlatform = connectedAccounts.filter(
    (acc) => acc.platform === publishPlatform && acc.status === "active",
  );
  const xPost = buildXPost(copyRef.current, subject.url ?? "");
  const xPostText = xPost.text;
  const xTextLength = xPost.weightedLength;
  const isXOverLimit = xTextLength > X_MAX_WEIGHTED_LENGTH;
  const scheduleErrorDetails = scheduleError ? toUserFacingError(scheduleErrorCode, scheduleError) : null;
  const channelDescribedBy = !hasSelectedChannel ? "promi-channels-help promi-channels-error" : "promi-channels-help";
  const testOnlyPlatform = isTestOnlyPlatform(publishPlatform);
  // "revoked" is what a user-initiated disconnect writes, so only expired/error mean the connection needs repair.
  const xNeedsReconnect = connectedAccounts.some(
    (acc) => acc.platform === "x" && (acc.status === "expired" || acc.status === "error"),
  );
  const showXConnectWarning = publishPlatform === "x" && accountsLoaded && accountsForPlatform.length === 0;
  const alreadyScheduled = matchesScheduledFingerprint();
  const scheduledImageUrl = uploadedImage?.imageUrl ?? subject.image ?? null;
  const xImageWillAttach = Boolean(selectedImage) || isUploadedScheduledImageUrl(scheduledImageUrl);
  const uploadedPreviewImage = isUploadedScheduledImageUrl(uploadedImage?.imageUrl) ? uploadedImage?.imageUrl ?? null : null;
  const previewImage = uploadedPreviewImage ?? subject.image;
  const previewImageAlt = subject.name || "Post image";
  const briefFieldError = (field: keyof Brief): string | undefined => {
    if (field === "name" || field === "description") return brief[field].trim() ? briefErrors[field] : undefined;
    return briefErrors[field];
  };

  const updateBrief = (field: keyof Brief, value: string) => {
    setBrief((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectSample = (sample: Product) => {
    const current = deriveSubject(brief, subjectBase);
    const hasOwnDetails =
      current.kind !== "catalog" && Boolean(brief.name.trim() || brief.description.trim() || brief.price.trim() || brief.url.trim());
    if (hasOwnDetails && !window.confirm("Replace your product details with this sample product?")) return;
    setSubjectBase(catalogBase(sample));
    setBrief(briefFromProduct(sample));
    setShowUnknownProductNotice(false);
    const url = new URL(window.location.href);
    url.searchParams.set("productId", sample.id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  if (sourcePostId && !sourcePrefill && !sourcePrefillError) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400" role="status" aria-live="polite">
          {sourcePrefillLoading ? "Loading source post details…" : "Loading…"}
        </p>
      </div>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-8">
        <section
          aria-labelledby="promi-brief-heading"
          className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-5"
        >
          <div>
            <h2 id="promi-brief-heading" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              What are you promoting?
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Give Promi the key facts. It uses them to write your post; they aren&apos;t posted as-is.
            </p>
          </div>
          {showUnknownProductNotice ? (
            <p
              role="status"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
            >
              We couldn&apos;t find that sample product. Enter your own details below, or start from a sample.
            </p>
          ) : null}
          {subject.kind === "catalog" && subject.image ? (
            <div className="flex items-center gap-3">
              <span className="relative aspect-square w-12 shrink-0 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
                <Image src={subject.image} alt="" fill className="object-cover" sizes="48px" />
              </span>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Using the sample product &ldquo;{subject.name}&rdquo;. Edit anything below to make it your own.
              </p>
            </div>
          ) : null}
          <div className="space-y-1">
            <label htmlFor="promi-brief-name" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Product or campaign name
            </label>
            <input
              id="promi-brief-name"
              type="text"
              value={brief.name}
              onChange={(e) => updateBrief("name", e.target.value)}
              maxLength={BRIEF_LIMITS.name}
              placeholder="For example: Hand-poured soy candle, or Spring weekend sale"
              aria-invalid={Boolean(briefFieldError("name"))}
              aria-describedby={briefFieldError("name") ? "promi-brief-name-error" : undefined}
              className={TEXT_FIELD_BASE}
            />
            {briefFieldError("name") ? (
              <p id="promi-brief-name-error" className="text-xs text-red-600 dark:text-red-400">{briefFieldError("name")}</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <label htmlFor="promi-brief-description" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              What should people know?
            </label>
            <textarea
              id="promi-brief-description"
              rows={4}
              value={brief.description}
              onChange={(e) => updateBrief("description", e.target.value)}
              maxLength={BRIEF_LIMITS.description}
              placeholder="What it is, who it's for, what makes it different, and any offer or dates. For example: Small-batch soy candles with a 40-hour burn. Made for cozy evenings at home. 15% off this weekend."
              aria-invalid={Boolean(briefFieldError("description"))}
              aria-describedby="promi-brief-description-count"
              className={`min-h-[100px] ${TEXT_FIELD_BASE}`}
            />
            <div className="flex flex-wrap items-start justify-between gap-2">
              {briefFieldError("description") ? (
                <p className="text-xs text-red-600 dark:text-red-400">{briefFieldError("description")}</p>
              ) : (
                <span />
              )}
              <p id="promi-brief-description-count" className="text-xs text-zinc-500 dark:text-zinc-400">
                {brief.description.length}/{BRIEF_LIMITS.description}
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="promi-brief-price" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Price or offer (optional)
              </label>
              <input
                id="promi-brief-price"
                type="text"
                value={brief.price}
                onChange={(e) => updateBrief("price", e.target.value)}
                maxLength={BRIEF_LIMITS.price}
                placeholder="$24, or 20% off this weekend"
                aria-invalid={Boolean(briefFieldError("price"))}
                className={TEXT_FIELD_BASE}
              />
              {briefFieldError("price") ? (
                <p className="text-xs text-red-600 dark:text-red-400">{briefFieldError("price")}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label htmlFor="promi-brief-url" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Link (optional)
              </label>
              <input
                id="promi-brief-url"
                type="url"
                inputMode="url"
                value={brief.url}
                onChange={(e) => updateBrief("url", e.target.value)}
                maxLength={BRIEF_LIMITS.url}
                placeholder="https://yourshop.com/product"
                aria-invalid={Boolean(briefFieldError("url"))}
                aria-describedby="promi-brief-url-help"
                className={TEXT_FIELD_BASE}
              />
              <p id="promi-brief-url-help" className={`text-xs ${briefFieldError("url") ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                {briefFieldError("url") ?? "Added to the X post when this is a valid http or https link."}
              </p>
            </div>
          </div>
          <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Or start from a sample product</p>
            <ul className="flex flex-wrap gap-2">
              {mockProducts.map((item) => {
                const selected = subject.kind === "catalog" && subject.id === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectSample(item)}
                      aria-pressed={selected}
                      className={`flex items-center gap-2 rounded-lg border py-1 pl-1 pr-2.5 text-xs transition-[border-color,background-color] duration-200 ${BUTTON_FOCUS} ${
                        selected
                          ? "border-zinc-900 bg-zinc-50 text-zinc-900 dark:border-zinc-100 dark:bg-zinc-800 dark:text-zinc-50"
                          : "border-zinc-200 text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600"
                      }`}
                    >
                      <span className="relative aspect-square w-7 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                        <Image src={item.image} alt="" fill className="object-cover" sizes="28px" />
                      </span>
                      {item.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {sourcePrefillError ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {sourcePrefillError}
          </p>
        ) : null}

        <section aria-labelledby="promi-publish-to-heading" className="space-y-3">
          <div>
            <h3 id="promi-publish-to-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Publish to
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Where this post goes when you schedule it.</p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label htmlFor="promi-publish-platform" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Platform
              </label>
              <select
                id="promi-publish-platform"
                value={publishPlatform}
                onChange={(e) => {
                  setPublishPlatform(e.target.value as PublishPlatform);
                  setAccountId("");
                }}
                aria-describedby={testOnlyPlatform ? "promi-test-platform-note" : undefined}
                className={DATE_TIME_FIELD}
              >
                <option value="x">{publishPlatformOptionLabel("x")}</option>
                <option value="instagram">{publishPlatformOptionLabel("instagram")}</option>
                <option value="facebook">{publishPlatformOptionLabel("facebook")}</option>
              </select>
            </div>
            {!testOnlyPlatform && accountsForPlatform.length > 0 ? (
              <div className="space-y-1">
                <label htmlFor="promi-connected-account" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Publishing account
                </label>
                <select
                  id="promi-connected-account"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className={DATE_TIME_FIELD}
                >
                  <option value="">Most recently connected {platformLabel(publishPlatform)} account</option>
                  {accountsForPlatform.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.displayName ?? acc.externalAccountId ?? acc.id}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          {testOnlyPlatform ? (
            <p
              id="promi-test-platform-note"
              className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {platformLabel(publishPlatform)} is test only during the beta. Scheduling runs a test publish and nothing is
              posted to {platformLabel(publishPlatform)}. Choose X to publish for real.
            </p>
          ) : null}
          {showXConnectWarning ? (
            <div
              role="status"
              className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/30"
            >
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {xNeedsReconnect ? "Your X account needs to be reconnected" : "No X account connected"}
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-200">
                {xNeedsReconnect
                  ? "Reconnect your X account to publish this post."
                  : "Connect an X account to publish this post."}{" "}
                You can keep writing and scheduling, but Promi can&apos;t post to X until an active X account is
                connected. This opens in a new tab so your work here stays put.
              </p>
              <a
                href="/api/oauth/x/start"
                target="_blank"
                rel="noopener noreferrer"
                className={BTN_SECONDARY}
              >
                {xNeedsReconnect ? "Reconnect X" : "Connect X"}
              </a>
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Reusable templates</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Plan: {plan.label} · Templates: {templates.length}/{limitLabel(plan.limits.reusableTemplates)}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Templates are saved in this browser on this device.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={templateLimitReached}
              className={templateLimitReached ? BTN_LOCKED : BTN_SECONDARY}
            >
              Save as template
            </button>
          </div>
          {templateLimitReached ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <p>Template limit reached on {plan.label}. Remove a template or upgrade to Pro.</p>
              <Link href="/upgrade" className="font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
                Upgrade
              </Link>
            </div>
          ) : null}
          {templateError ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {templateError}
              </p>
              {templateError.toLowerCase().includes("limit") ? (
                <Link href="/upgrade" className="text-xs font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
                  Upgrade
                </Link>
              ) : null}
            </div>
          ) : null}
          {templateNotice ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300" role="status">
              {templateNotice}
            </p>
          ) : null}
          {templates.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">No templates yet. Save this post setup as your first reusable template.</p>
          ) : (
            <ul className="space-y-2">
              {templates
                .slice()
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                .slice(0, 6)
                .map((template) => (
                  <li key={template.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-800 dark:text-zinc-100">{template.name}</p>
                      <p className="text-zinc-500 dark:text-zinc-400">{platformLabel(template.platform)} · updated {formatAt(template.updatedAt)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => applyTemplate(template)}
                        className={`rounded-md border border-zinc-300 px-2 py-1 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900 ${BUTTON_FOCUS}`}
                      >
                        Use template
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveTemplate(template.id)}
                        className={`rounded-md border border-zinc-300 px-2 py-1 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900 ${BUTTON_FOCUS}`}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Copy formats to generate</h3>
          <p id="promi-channels-help" className="text-xs text-zinc-500 dark:text-zinc-400">
            Which kinds of copy Promi writes for you. This doesn&apos;t change where the post is published. That&apos;s set
            under Publish to.
          </p>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map(({ id, label }) => (
              <label
                key={id}
                htmlFor={`promi-channel-${id}`}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-[border-color,background-color,box-shadow,color] duration-200 ease-out ${CHOICE_RING} ${
                  channels[id]
                    ? "border-zinc-900 bg-zinc-50 text-zinc-900 dark:border-zinc-100 dark:bg-zinc-800 dark:text-zinc-50"
                    : "border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600"
                }`}
              >
                <input
                  id={`promi-channel-${id}`}
                  type="checkbox"
                  checked={channels[id]}
                  onChange={() => toggleChannel(id)}
                  aria-describedby={channelDescribedBy}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-zinc-600 dark:bg-zinc-900 dark:focus-visible:ring-zinc-500/40 dark:focus-visible:ring-offset-zinc-950"
                />
                {label}
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Tone</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {TONES.map((t) => (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-[border-color,background-color,box-shadow] duration-200 ease-out ${CHOICE_RING} ${
                  tone === t.id
                    ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
                }`}
              >
                <input
                  type="radio"
                  name="tone"
                  value={t.id}
                  checked={tone === t.id}
                  onChange={() => setTone(t.id)}
                  className="h-4 w-4 border-zinc-300 text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-zinc-600 dark:bg-zinc-900 dark:focus-visible:ring-zinc-500/40 dark:focus-visible:ring-offset-zinc-950"
                />
                {t.label}
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Promotion angle</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {ANGLES.map((a) => (
              <label
                key={a.id}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-[border-color,background-color,box-shadow] duration-200 ease-out ${CHOICE_RING} ${
                  angle === a.id
                    ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
                }`}
              >
                <input
                  type="radio"
                  name="angle"
                  value={a.id}
                  checked={angle === a.id}
                  onChange={() => setAngle(a.id)}
                  className="h-4 w-4 border-zinc-300 text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-zinc-600 dark:bg-zinc-900 dark:focus-visible:ring-zinc-500/40 dark:focus-visible:ring-offset-zinc-950"
                />
                {a.label}
              </label>
            ))}
          </div>
        </section>

        <div>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={isGenerating || persistKind !== null || !hasSelectedChannel || !briefReadyForGenerate}
            aria-busy={isGenerating}
            className={BTN_PRIMARY}
          >
            {isGenerating ? (
              <>
                <InlineSpinner />
                Generating...
              </>
            ) : (
              "Generate post"
            )}
          </button>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Selected: {toneLabel} · {angleLabel}
          </p>
          {!hasSelectedChannel ? (
            <p id="promi-channels-error" className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Select at least one copy format to generate content.
            </p>
          ) : null}
          {!briefReadyForGenerate ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              {briefErrors.name || briefErrors.description
                ? "Add a name and a few details under What are you promoting? to generate."
                : "Fix the highlighted details under What are you promoting? to generate."}
            </p>
          ) : null}
          {generateSuccess ? (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400" role="status" aria-live="polite">
              Ready — you can edit your copy below or save when you&apos;re happy with it.
            </p>
          ) : null}
          {generateError ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
              {generateError}
            </p>
          ) : null}
        </div>

        <section className="space-y-4 border-t border-zinc-200 pt-8 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Generated content</h3>
          <div>
            <label
              htmlFor="promi-instagram-caption"
              className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
            >
              Instagram caption
            </label>
            <textarea
              id="promi-instagram-caption"
              rows={5}
              value={instagramCaption}
              onChange={(e) => setInstagramCaption(e.target.value)}
              placeholder="Generate content, then edit your Instagram caption here."
              className={`mt-1.5 min-h-[110px] ${TEXT_FIELD_BASE}`}
            />
          </div>

          <div>
            <label
              htmlFor="promi-pinterest-title"
              className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
            >
              Pinterest title
            </label>
            <input
              id="promi-pinterest-title"
              type="text"
              value={pinterestTitle}
              onChange={(e) => setPinterestTitle(e.target.value)}
              placeholder="Generate content, then edit your Pinterest title."
              className={`mt-1.5 ${TEXT_FIELD_BASE}`}
            />
          </div>

          <div>
            <label
              htmlFor="promi-pinterest-description"
              className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
            >
              Pinterest description
            </label>
            <textarea
              id="promi-pinterest-description"
              rows={4}
              value={pinterestDescription}
              onChange={(e) => setPinterestDescription(e.target.value)}
              placeholder="Generate content, then edit your Pinterest description."
              className={`mt-1.5 min-h-[100px] ${TEXT_FIELD_BASE}`}
            />
          </div>

          <div>
            <label
              htmlFor="promi-hashtags"
              className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
            >
              Hashtags
            </label>
            <textarea
              id="promi-hashtags"
              rows={3}
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="Generate content, then edit hashtags (for example: #shopsmall #handmade)."
              className={`mt-1.5 min-h-[88px] ${TEXT_FIELD_BASE}`}
            />
          </div>
        </section>

        {publishPlatform === "x" ? (
          <section aria-labelledby="promi-x-preview-heading" className="space-y-2 border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <h3 id="promi-x-preview-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              This is what will be posted to X
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Promi posts your caption, then your link, then your hashtags. The caption is your Instagram caption,
              Pinterest title, and Pinterest description. Edit those fields, or the link above, to change this text.
            </p>
            <div
              className="whitespace-pre-wrap break-words rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm leading-relaxed text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {xPostText || (
                <span className="text-zinc-500 dark:text-zinc-400">Generate or write your copy above to see the X post.</span>
              )}
            </div>
            <p
              className={`text-xs ${isXOverLimit ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}
              role={isXOverLimit ? "alert" : undefined}
            >
              {xTextLength}/{X_MAX_WEIGHTED_LENGTH} characters
              {isXOverLimit ? ". Over the X limit. Shorten your copy before scheduling." : ". Links count as 23 characters on X."}
            </p>
            {xPost.shortened ? (
              <p className="text-xs text-amber-700 dark:text-amber-300" role="status">
                Shortened to fit X. The link is kept, then as many whole hashtags as fit, then as much of the caption as fits.
              </p>
            ) : null}
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {xImageWillAttach
                ? "Image: your uploaded image will be attached."
                : "No image will be attached. Sample product images aren't automatically posted to X."}
            </p>
          </section>
        ) : null}

        <section className="space-y-4 border-t border-zinc-200 pt-8 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Schedule</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {plan.label} plan usage: {activeScheduledCount ?? "..."}/{limitLabel(plan.limits.scheduledPostsActive)} active scheduled posts.
          </p>
          {scheduledLimitReached ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <p>You reached your scheduling limit on {plan.label}. Upgrade to continue scheduling.</p>
              <Link href="/upgrade" className="font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
                Upgrade
              </Link>
            </div>
          ) : null}
          <div className="space-y-1">
            <label htmlFor="promi-upload-image" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Image for X post (optional, 1 file)
            </label>
            <input
              id="promi-upload-image"
              ref={imageInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
              className={DATE_TIME_FIELD}
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Upload one image for X only. Allowed formats: JPG/JPEG, PNG, WEBP. Max size: {Math.floor(IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024))}MB.
            </p>
            {!selectedImage && uploadedImage?.imageUrl ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Using your saved image. Upload a new file to replace it.
              </p>
            ) : null}
            {selectedImage || uploadedImage?.imageUrl ? (
              <button
                type="button"
                onClick={handleRemoveImage}
                disabled={persistKind !== null}
                className="text-xs font-medium text-zinc-700 underline underline-offset-2 disabled:opacity-50 dark:text-zinc-200"
              >
                Remove image
              </button>
            ) : null}
            {selectedImagePreviewUrl ? (
              <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
                <img
                  src={selectedImagePreviewUrl}
                  alt="Selected upload preview"
                  className="h-40 w-full rounded object-cover"
                />
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {selectedImage?.name ?? "Selected image"} ({selectedImage ? formatBytes(selectedImage.size) : "0 MB"})
                </p>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label htmlFor="promi-schedule-date" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Date
              </label>
              <input
                id="promi-schedule-date"
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                aria-describedby="promi-schedule-datetime-help"
                className={DATE_TIME_FIELD}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="promi-schedule-time" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Time
              </label>
              <input
                id="promi-schedule-time"
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                aria-describedby="promi-schedule-datetime-help"
                className={DATE_TIME_FIELD}
              />
            </div>
          </div>
          <p id="promi-schedule-datetime-help" className="text-xs text-zinc-500 dark:text-zinc-400">
            Choose a future date and time.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              disabled={persistKind !== null}
              aria-busy={persistKind === "draft"}
              className={BTN_SECONDARY}
            >
              {persistKind === "draft" ? (
                <>
                  <InlineSpinner />
                  Saving…
                </>
              ) : (
                "Save draft"
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleSchedulePromotion()}
              disabled={
                persistKind !== null || (publishPlatform === "x" && isXOverLimit) || scheduledLimitReached || alreadyScheduled
              }
              aria-busy={persistKind === "schedule"}
              className={scheduledLimitReached ? BTN_LOCKED : BTN_PRIMARY_SM}
            >
              {persistKind === "schedule" ? (
                <>
                  <InlineSpinner />
                  Scheduling…
                </>
              ) : alreadyScheduled ? (
                "Scheduled"
              ) : (
                "Schedule post"
              )}
            </button>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {alreadyScheduled
              ? "This post is already scheduled. Change the copy, image, date, time, platform, or account to schedule another version, or start a new post."
              : "Save draft keeps this copy and optional date/time on this device. Schedule post sends it to the publishing queue."}
          </p>
          {scheduleError ? (
            <div className="space-y-1">
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {scheduleError}
              </p>
              {scheduleErrorDetails?.actions.map((action) => (
                <Link
                  key={`${action.href}-${action.label}`}
                  href={action.href}
                  className="mr-3 text-xs font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100"
                >
                  {action.label}
                </Link>
              ))}
            </div>
          ) : null}
          {scheduledSuccess ? (
            <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900/40 dark:bg-emerald-950/30">
              <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status" aria-live="polite">
                {isTestOnlyPlatform(scheduledSuccess.platform)
                  ? `Test publish scheduled for ${scheduledSuccess.when}. Nothing will be posted to ${platformLabel(scheduledSuccess.platform)}.`
                  : `Scheduled for ${scheduledSuccess.when} on ${platformLabel(scheduledSuccess.platform)}.`}
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">{PUBLISHING_TIMING_NOTE}</p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleStartAnother}
                  className={`text-xs font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100 ${BUTTON_FOCUS}`}
                >
                  Start another post
                </button>
                <Link href="/scheduled" className="text-xs font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
                  Open Scheduled queue
                </Link>
                <Link href="/history" className="text-xs font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
                  Check History
                </Link>
              </div>
            </div>
          ) : null}
          {saveNotice ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status" aria-live="polite">
              {saveNotice}
            </p>
          ) : null}
        </section>
      </div>

      <aside className="mt-10 space-y-4 lg:sticky lg:top-6 lg:mt-0">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Preview
        </h3>

        {channels.instagram ? (
          <PreviewCard
            variant="instagram"
            imageSrc={previewImage}
            imageAlt={previewImageAlt}
            caption={previewCaption}
            hashtags={hashtags}
            isFilled={hasGenerated}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Turn on Instagram to see this preview.
          </p>
        )}

        {channels.pinterest ? (
          <PreviewCard
            variant="pinterest"
            imageSrc={previewImage}
            imageAlt={previewImageAlt}
            title={previewPinTitle}
            description={previewPinDesc}
            isFilled={hasGenerated}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Turn on Pinterest to see this preview.
          </p>
        )}
      </aside>
    </div>
  );
}
