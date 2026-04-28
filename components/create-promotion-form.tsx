"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PreviewCard } from "@/components/preview-card";
import { readPromotions, upsertPromotion } from "@/lib/promotions-storage";
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
} from "@/src/lib/media/image-upload";
import { toUserFacingError } from "@/lib/user-facing-error";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const CHANNELS = [
  { id: "instagram" as const, label: "Instagram" },
  { id: "pinterest" as const, label: "Pinterest" },
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
const X_MAX_TEXT_LENGTH = 280;

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

function buildXPostText(copy: PromotionCopy): string {
  return [
    copy.instagramCaption.trim(),
    copy.pinterestTitle.trim(),
    copy.pinterestDescription.trim(),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
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

function fallbackSourceProduct(source: ScheduledPostSource): Product {
  return {
    id: source.productId,
    name: source.productName,
    image: source.imageUrl || "/images/linen-tote-bag1.jpg",
    description: "Reused from a previously scheduled or published post.",
    price: 0,
    stockStatus: "in_stock",
    tags: ["reused-post"],
    productUrl: "#",
  };
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
  product: Product,
  toneLabel: string,
  angleLabel: string,
  channelIds: string[],
  copy: PromotionCopy,
  scheduledAt: string | null,
  existingId?: string,
): Promotion {
  return {
    id: existingId ?? crypto.randomUUID(),
    productId: product.id,
    productName: product.name,
    productImage: product.image,
    imageRefs: [product.image],
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
  product: Product | null;
  /** True when `productId` was in the URL but did not match any mock product. */
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
  const [publishPlatform, setPublishPlatform] = useState<PublishPlatform>("instagram");
  const [accountId, setAccountId] = useState("");
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
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
  const effectiveProduct = product ?? (sourcePrefill ? fallbackSourceProduct(sourcePrefill) : null);
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
    if (template.imageUrl) {
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
    if (!product || !promotionId?.trim()) return;
    const saved = readPromotions().items.find((p) => p.id === promotionId.trim());
    if (!saved || saved.productId !== product.id) return;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate when product id or promotion id changes; avoid re-running on new product object identity
  }, [product?.id, promotionId]);

  useEffect(() => {
    if (!sourcePrefill) return;
    const payload = asObject(sourcePrefill.contentPayload) ?? {};

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

    if (sourcePrefill.imageUrl?.trim()) {
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

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/connected-accounts", { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as { data?: ConnectedAccount[] } | null;
        if (!res.ok) return;
        setConnectedAccounts(Array.isArray(body?.data) ? body.data : []);
      } catch {
        // optional; mock publish still works without account selection
      }
    };
    void run();
  }, []);

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
    if (!effectiveProduct || generateInFlightRef.current || persistInFlightRef.current) return;

    const selectedChannels = CHANNELS.filter(({ id }) => channels[id]).map(({ id }) => id);
    if (selectedChannels.length === 0) {
      setGenerateError("Select at least one channel, then generate content.");
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
          productName: effectiveProduct.name,
          productDescription: effectiveProduct.description,
          productPrice: effectiveProduct.price,
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
        setGenerateError(
          typeof errBody?.error === "string"
            ? errBody.error
            : "We could not generate content right now. Please try again.",
        );
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

  const persistDraft = (scheduledAt: string | null) => {
    if (!effectiveProduct) return;
    const channelIds = CHANNELS.filter(({ id }) => channels[id]).map(({ id }) => id);
    const tl = TONES.find((t) => t.id === tone)?.label ?? tone;
    const al = ANGLES.find((a) => a.id === angle)?.label ?? angle;
    const record = buildPromotionPayload(
      effectiveProduct,
      tl,
      al,
      channelIds,
      copyRef.current,
      scheduledAt,
      promotionId?.trim(),
    );
    try {
      upsertPromotion(record);
      setScheduleError(null);
      setSaveNotice("Draft saved on this device.");
    } catch {
      setSaveNotice(null);
      setScheduleError(
        "Could not save this promotion on this device. Check your browser storage and try again.",
      );
    }
  };

  const handleSaveDraft = () => {
    if (!effectiveProduct || persistKind || isGenerating || persistInFlightRef.current) return;
    setSaveNotice(null);
    setScheduledSuccess(null);
    setGenerateError(null);
    setScheduleErrorCode(null);
    setScheduleError(null);
    setPersistKind("draft");
    persistInFlightRef.current = true;
    queueMicrotask(() => {
      try {
        const scheduledAt = combineLocalDateTime(scheduleDate, scheduleTime);
        persistDraft(scheduledAt);
      } finally {
        persistInFlightRef.current = false;
        window.setTimeout(() => setPersistKind(null), 220);
      }
    });
  };

  const handleSchedulePromotion = async () => {
    if (!effectiveProduct || persistKind || isGenerating || persistInFlightRef.current) {
      return;
    }
    setSaveNotice(null);
    setScheduledSuccess(null);
    setGenerateError(null);
    setScheduleErrorCode(null);
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
    const xTextLength = buildXPostText(copyRef.current).length;
    if (publishPlatform === "x" && xTextLength > X_MAX_TEXT_LENGTH) {
      setScheduleError(`X post text is too long (${xTextLength}/${X_MAX_TEXT_LENGTH}). Shorten your copy before scheduling.`);
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
      let imageUrl = effectiveProduct.image;
      if (selectedImage) {
        const formData = new FormData();
        formData.set("image", selectedImage);
        const uploadRes = await fetch("/api/uploads/scheduled-image", {
          method: "POST",
          body: formData,
        });
        const uploadBody = (await uploadRes.json().catch(() => null)) as { data?: UploadedImageMeta; error?: string; details?: string } | null;
        if (!uploadRes.ok || !uploadBody?.data?.imageUrl) {
          setScheduleError(uploadBody?.error || uploadBody?.details || "Could not upload image.");
          return;
        }
        setUploadedImage(uploadBody.data);
        imageUrl = uploadBody.data.imageUrl;
      } else if (uploadedImage?.imageUrl) {
        imageUrl = uploadedImage.imageUrl;
      }

      const res = await fetch("/api/scheduled-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: effectiveProduct.id,
          productName: effectiveProduct.name,
          imageUrl,
          channels: selectedChannels,
          contentPayload: {
            tone: tl,
            angle: al,
            instagramCaption: copyRef.current.instagramCaption,
            pinterestTitle: copyRef.current.pinterestTitle,
            pinterestDescription: copyRef.current.pinterestDescription,
            hashtags: copyRef.current.hashtags,
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
      setSaveNotice(`Scheduled for ${scheduledLabel} on ${platformLabel(publishPlatform)}.`);
      setScheduledSuccess({ when: scheduledLabel, platform: publishPlatform });
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
        imageUrl: uploadedImage?.imageUrl ?? effectiveProduct?.image ?? null,
      });
      setTemplateError(null);
      setTemplateNotice(`Saved reusable template: ${saved.name}`);
      refreshTemplates();
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Could not save reusable template on this device.");
    }
  };

  const handleRemoveTemplate = (id: string) => {
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
  const xTextLength = buildXPostText(copyRef.current).length;
  const isXOverLimit = xTextLength > X_MAX_TEXT_LENGTH;
  const scheduleErrorDetails = scheduleError ? toUserFacingError(scheduleErrorCode, scheduleError) : null;
  const channelDescribedBy = !hasSelectedChannel ? "promi-channels-help promi-channels-error" : "promi-channels-help";
  const accountDescribedBy = accountsForPlatform.length === 0 ? "promi-connected-account-help" : undefined;

  if (invalidProductId && !sourcePostId) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          We couldn&apos;t find that product. Go back to{" "}
          <Link href="/products" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50">
            Products
          </Link>{" "}
          and click <span className="font-medium">Promote</span> again.
        </p>
      </div>
    );
  }

  if (!effectiveProduct) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
        {sourcePrefillLoading ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status" aria-live="polite">
            Loading source post details...
          </p>
        ) : sourcePrefillError ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {sourcePrefillError}
          </p>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No product selected yet. Open{" "}
            <Link href="/products" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50">
              Products
            </Link>{" "}
            and click <span className="font-medium">Promote</span> on a product to continue.
            {" "}You can also start from suggested products on the{" "}
            <Link href="/" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50">
              Home page
            </Link>
            .
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-8">
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="relative mx-auto aspect-square w-28 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800 sm:mx-0">
              <Image
                src={effectiveProduct.image}
                alt={effectiveProduct.name}
                fill
                className="object-cover"
                sizes="112px"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{effectiveProduct.name}</h2>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {usd.format(effectiveProduct.price)}
              </p>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {effectiveProduct.description}
              </p>
              <div className="space-y-1">
                {effectiveProduct.productUrl !== "#" ? (
                  <>
                    <a
                      href={effectiveProduct.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
                    >
                      View this product in your store
                    </a>
                    <p
                      className="break-all text-left text-xs text-zinc-500 dark:text-zinc-400"
                      title={effectiveProduct.productUrl}
                    >
                      {effectiveProduct.productUrl}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Storefront URL is not available for this reused post.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {sourcePrefillError ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {sourcePrefillError}
          </p>
        ) : null}

        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Reusable templates</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Plan: {plan.label} · Templates: {templates.length}/{limitLabel(plan.limits.reusableTemplates)}
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
                Upgrade to Pro
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
                  Upgrade to Pro
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
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Channels</h3>
          <p id="promi-channels-help" className="text-xs text-zinc-500 dark:text-zinc-400">
            Where you plan to publish this promotion.
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
              disabled={isGenerating || persistKind !== null || !hasSelectedChannel}
            aria-busy={isGenerating}
            className={BTN_PRIMARY}
          >
            {isGenerating ? (
              <>
                <InlineSpinner />
                Generating...
              </>
            ) : (
              "Generate Content"
            )}
          </button>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Selected: {toneLabel} · {angleLabel}
          </p>
          {!hasSelectedChannel ? (
            <p id="promi-channels-error" className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Select at least one channel to generate content.
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
            {publishPlatform === "x" ? (
              <p
                className={`mt-1 text-xs ${isXOverLimit ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}
                role={isXOverLimit ? "alert" : undefined}
              >
                X character count: {xTextLength}/{X_MAX_TEXT_LENGTH}
                {isXOverLimit ? " (over limit)" : ""}
              </p>
            ) : null}
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

        <section className="space-y-4 border-t border-zinc-200 pt-8 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Schedule</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {plan.label} plan usage: {activeScheduledCount ?? "..."}/{limitLabel(plan.limits.scheduledPostsActive)} active scheduled posts.
          </p>
          {scheduledLimitReached ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <p>You reached your scheduling limit on {plan.label}. Upgrade to continue scheduling.</p>
              <Link href="/upgrade" className="font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
                Upgrade to Pro
              </Link>
            </div>
          ) : null}
          <div className="space-y-1">
            <label htmlFor="promi-upload-image" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Image for X post (optional, 1 file)
            </label>
            <input
              id="promi-upload-image"
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
                Reusing image from the source post. Upload a new file if you want to replace it.
              </p>
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
                className={DATE_TIME_FIELD}
              >
                <option value="instagram">Instagram</option>
                <option value="x">X</option>
                <option value="facebook">Facebook</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="promi-connected-account" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Connected account (optional)
              </label>
              <select
                id="promi-connected-account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                aria-describedby={accountDescribedBy}
                className={DATE_TIME_FIELD}
              >
                <option value="">No account selected</option>
                {accountsForPlatform.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.displayName ?? acc.externalAccountId ?? acc.id}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {accountsForPlatform.length === 0 ? (
            <p id="promi-connected-account-help" className="text-xs text-zinc-500 dark:text-zinc-400">
              No active {platformLabel(publishPlatform)} account found.{" "}
              <Link href="/settings/accounts" className="font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-100">
                Manage accounts
              </Link>{" "}
              for live publishing.
            </p>
          ) : null}
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
              onClick={handleSaveDraft}
              disabled={persistKind !== null}
              aria-busy={persistKind === "draft"}
              className={BTN_SECONDARY}
            >
              {persistKind === "draft" ? (
                <>
                  <InlineSpinner />
                  Saving...
                </>
              ) : (
                "Save as Draft"
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleSchedulePromotion()}
              disabled={persistKind !== null || (publishPlatform === "x" && isXOverLimit) || scheduledLimitReached}
              aria-busy={persistKind === "schedule"}
              className={scheduledLimitReached ? BTN_LOCKED : BTN_PRIMARY_SM}
            >
              {persistKind === "schedule" ? (
                <>
                  <InlineSpinner />
                  Scheduling...
                </>
              ) : (
                "Schedule Post"
              )}
            </button>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Save as Draft keeps this copy and optional date/time on this device. Schedule Post sends it to the server queue.
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
                Scheduled for {scheduledSuccess.when} on {platformLabel(scheduledSuccess.platform)}.
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Promi will publish this automatically using the server scheduler.
              </p>
              <div className="flex flex-wrap gap-3">
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
            imageSrc={effectiveProduct.image}
            imageAlt={effectiveProduct.name}
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
            imageSrc={effectiveProduct.image}
            imageAlt={effectiveProduct.name}
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
