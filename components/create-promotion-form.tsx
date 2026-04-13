"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PreviewCard } from "@/components/preview-card";
import { readPromotions, upsertPromotion } from "@/lib/promotions-storage";
import type { Product, Promotion } from "@/lib/types";

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

type ChannelId = (typeof CHANNELS)[number]["id"];

type PromotionCopy = {
  instagramCaption: string;
  pinterestTitle: string;
  pinterestDescription: string;
  hashtags: string;
};

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

const FIELD_FOCUS =
  "focus-visible:outline-none focus-visible:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-400/20 focus-visible:ring-offset-0 dark:focus-visible:border-zinc-500 dark:focus-visible:ring-zinc-500/15";

const TEXT_FIELD_BASE = `w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-800 placeholder:text-zinc-400 transition-[border-color,box-shadow] duration-200 ${FIELD_FOCUS} dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:placeholder:text-zinc-500`;

const DATE_TIME_FIELD = `rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 transition-[border-color,box-shadow] duration-200 ${FIELD_FOCUS} dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100`;

const BTN_PRIMARY =
  "promi-press inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-[background-color,box-shadow,transform,opacity] duration-200 ease-out hover:bg-zinc-950 hover:shadow-md hover:shadow-zinc-900/35 enabled:active:scale-[0.98] motion-safe:enabled:active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:hover:shadow-zinc-900/12 dark:enabled:active:bg-zinc-200";

const BTN_PRIMARY_SM =
  "promi-press inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-[background-color,box-shadow,transform,opacity] duration-200 ease-out hover:bg-zinc-950 hover:shadow-md hover:shadow-zinc-900/35 enabled:active:scale-[0.98] motion-safe:enabled:active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:hover:shadow-zinc-900/12 dark:enabled:active:bg-zinc-200";

const BTN_SECONDARY =
  "promi-press inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-[background-color,box-shadow,transform,border-color,opacity] duration-200 ease-out hover:border-zinc-400 hover:bg-zinc-100 hover:shadow-sm hover:shadow-zinc-900/[0.06] enabled:active:scale-[0.98] motion-safe:enabled:active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:border-zinc-500 dark:hover:bg-zinc-900 dark:hover:shadow-black/25";

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
};

export function CreatePromotionForm({ product, invalidProductId, promotionId }: CreatePromotionFormProps) {
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
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [persistKind, setPersistKind] = useState<null | "draft" | "schedule">(null);
  const [generateSuccess, setGenerateSuccess] = useState(false);

  useEffect(() => {
    if (!generateSuccess) return;
    const id = window.setTimeout(() => setGenerateSuccess(false), 4200);
    return () => window.clearTimeout(id);
  }, [generateSuccess]);

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

  const toggleChannel = (id: ChannelId) => {
    setChannels((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleGenerate = async () => {
    if (!product) return;

    const selectedChannels = CHANNELS.filter(({ id }) => channels[id]).map(({ id }) => id);
    if (selectedChannels.length === 0) {
      setGenerateError("Select at least one channel, then generate content.");
      return;
    }

    const toneLabel = TONES.find((t) => t.id === tone)?.label ?? tone;
    const angleLabel = ANGLES.find((a) => a.id === angle)?.label ?? angle;

    setGenerateError(null);
    setGenerateSuccess(false);
    setIsGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: product.name,
          productDescription: product.description,
          productPrice: product.price,
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
      setIsGenerating(false);
    }
  };

  const persistDraft = (scheduledAt: string | null) => {
    if (!product) return;
    const channelIds = CHANNELS.filter(({ id }) => channels[id]).map(({ id }) => id);
    const tl = TONES.find((t) => t.id === tone)?.label ?? tone;
    const al = ANGLES.find((a) => a.id === angle)?.label ?? angle;
    const record = buildPromotionPayload(
      product,
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
    if (!product || persistKind) return;
    setSaveNotice(null);
    setPersistKind("draft");
    queueMicrotask(() => {
      try {
        const scheduledAt = combineLocalDateTime(scheduleDate, scheduleTime);
        persistDraft(scheduledAt);
      } finally {
        window.setTimeout(() => setPersistKind(null), 220);
      }
    });
  };

  const handleSchedulePromotion = async () => {
    if (!product || persistKind) return;
    setSaveNotice(null);
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

    setScheduleError(null);
    setPersistKind("schedule");
    const selectedChannels = CHANNELS.filter(({ id }) => channels[id]).map(({ id }) => id);
    const tl = TONES.find((t) => t.id === tone)?.label ?? tone;
    const al = ANGLES.find((a) => a.id === angle)?.label ?? angle;

    try {
      const res = await fetch("/api/scheduled-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          productName: product.name,
          imageUrl: product.image,
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
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; details?: string } | null;
      if (!res.ok) {
        setScheduleError(body?.error || body?.details || "Could not schedule this promotion right now.");
        return;
      }
      setSaveNotice("Promotion scheduled.");
    } catch {
      setScheduleError("Could not schedule this promotion right now.");
    } finally {
      window.setTimeout(() => setPersistKind(null), 220);
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

  if (invalidProductId) {
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

  if (!product) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No product selected yet. Open{" "}
          <Link href="/products" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50">
            Products
          </Link>{" "}
          and click <span className="font-medium">Promote</span> on a product to continue.
        </p>
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
                src={product.image}
                alt={product.name}
                fill
                className="object-cover"
                sizes="112px"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{product.name}</h2>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {usd.format(product.price)}
              </p>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {product.description}
              </p>
              <div className="space-y-1">
                <a
                  href={product.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
                >
                  View this product in your store
                </a>
                <p
                  className="break-all text-left text-xs text-zinc-500 dark:text-zinc-400"
                  title={product.productUrl}
                >
                  {product.productUrl}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Channels</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Where you plan to publish this promotion.</p>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map(({ id, label }) => (
              <label
                key={id}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-[border-color,background-color,box-shadow,color] duration-200 ease-out ${CHOICE_RING} ${
                  channels[id]
                    ? "border-zinc-900 bg-zinc-50 text-zinc-900 dark:border-zinc-100 dark:bg-zinc-800 dark:text-zinc-50"
                    : "border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600"
                }`}
              >
                <input
                  type="checkbox"
                  checked={channels[id]}
                  onChange={() => toggleChannel(id)}
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
            disabled={isGenerating || !hasSelectedChannel}
            aria-busy={isGenerating}
            className={BTN_PRIMARY}
          >
            {isGenerating ? (
              <>
                <InlineSpinner />
                Generating…
              </>
            ) : (
              "Generate Content"
            )}
          </button>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Selected: {toneLabel} · {angleLabel}
          </p>
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

        <section className="space-y-4 border-t border-zinc-200 pt-8 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Schedule</h3>
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
                className={DATE_TIME_FIELD}
              />
            </div>
          </div>
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
                  Saving…
                </>
              ) : (
                "Save as Draft"
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleSchedulePromotion()}
              disabled={persistKind !== null}
              aria-busy={persistKind === "schedule"}
              className={BTN_PRIMARY_SM}
            >
              {persistKind === "schedule" ? (
                <>
                  <InlineSpinner />
                  Scheduling…
                </>
              ) : (
                "Schedule Promotion"
              )}
            </button>
          </div>
          {scheduleError ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {scheduleError}
            </p>
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
            imageSrc={product.image}
            imageAlt={product.name}
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
            imageSrc={product.image}
            imageAlt={product.name}
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
