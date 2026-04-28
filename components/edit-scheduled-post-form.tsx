"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const REFRESH_EVENT = "promi:scheduled-posts-updated";

type EditScheduledPostFormProps = {
  post: {
    id: string;
    productName: string;
    scheduledAt: string;
    contentPayload: unknown;
  };
};

function splitLocalDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` };
}

function combineLocalDateTime(date: string, time: string): string | null {
  if (!date.trim() || !time.trim()) return null;
  const isoLocal = `${date}T${time}:00`;
  const d = new Date(isoLocal);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function getPayloadObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

export function EditScheduledPostForm({ post }: EditScheduledPostFormProps) {
  const router = useRouter();
  const initialPayload = useMemo(() => getPayloadObject(post.contentPayload), [post.contentPayload]);
  const { date, time } = splitLocalDateTime(post.scheduledAt);

  const [instagramCaption, setInstagramCaption] = useState(String(initialPayload.instagramCaption ?? ""));
  const [pinterestTitle, setPinterestTitle] = useState(String(initialPayload.pinterestTitle ?? ""));
  const [pinterestDescription, setPinterestDescription] = useState(String(initialPayload.pinterestDescription ?? ""));
  const [hashtags, setHashtags] = useState(String(initialPayload.hashtags ?? ""));
  const [scheduleDate, setScheduleDate] = useState(date);
  const [scheduleTime, setScheduleTime] = useState(time);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const scheduleDateTimeDescribedBy = error
    ? "promi-edit-schedule-datetime-help promi-edit-form-error"
    : "promi-edit-schedule-datetime-help";

  const handleSave = async () => {
    if (saving) return;
    setError(null);
    setSuccess(null);

    if (!scheduleDate.trim() || !scheduleTime.trim()) {
      setError("Choose a date and time before saving.");
      return;
    }
    const scheduledAt = combineLocalDateTime(scheduleDate, scheduleTime);
    if (!scheduledAt) {
      setError("We could not read that date and time. Try again.");
      return;
    }
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      setError("Choose a future date and time.");
      return;
    }

    const contentPayload = {
      ...initialPayload,
      instagramCaption,
      pinterestTitle,
      pinterestDescription,
      hashtags,
    };

    setSaving(true);
    try {
      const res = await fetch(`/api/scheduled-posts/${encodeURIComponent(post.id)}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentPayload, scheduledAt }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; details?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? body?.details ?? "Could not save changes.");
        return;
      }
      setSuccess("Scheduled post updated.");
      window.dispatchEvent(new Event(REFRESH_EVENT));
      window.setTimeout(() => {
        router.push("/scheduled");
        router.refresh();
      }, 450);
    } catch {
      setError("Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Edit scheduled post</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{post.productName}</p>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Instagram caption</span>
        <textarea
          id="promi-edit-instagram-caption"
          value={instagramCaption}
          onChange={(e) => setInstagramCaption(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-300 transition focus:border-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:focus:border-zinc-500"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Pinterest title</span>
        <input
          id="promi-edit-pinterest-title"
          value={pinterestTitle}
          onChange={(e) => setPinterestTitle(e.target.value)}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-300 transition focus:border-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:focus:border-zinc-500"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Pinterest description</span>
        <textarea
          id="promi-edit-pinterest-description"
          value={pinterestDescription}
          onChange={(e) => setPinterestDescription(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-300 transition focus:border-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:focus:border-zinc-500"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Hashtags</span>
        <input
          id="promi-edit-hashtags"
          value={hashtags}
          onChange={(e) => setHashtags(e.target.value)}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-300 transition focus:border-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:focus:border-zinc-500"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Date</span>
          <input
            id="promi-edit-schedule-date"
            type="date"
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
            aria-describedby={scheduleDateTimeDescribedBy}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-300 transition focus:border-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:focus:border-zinc-500"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Time</span>
          <input
            id="promi-edit-schedule-time"
            type="time"
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
            aria-describedby={scheduleDateTimeDescribedBy}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-300 transition focus:border-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:focus:border-zinc-500"
          />
        </label>
      </div>
      <p id="promi-edit-schedule-datetime-help" className="text-xs text-zinc-500 dark:text-zinc-400">
        Choose a future date and time.
      </p>

      {error ? <p id="promi-edit-form-error" className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status" aria-live="polite">{success}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        <Link
          href="/scheduled"
          className="promi-press inline-flex items-center justify-center rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
        >
          Back
        </Link>
      </div>
    </section>
  );
}
