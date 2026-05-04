"use client";

import Link from "next/link";
import { useState } from "react";
import { cancelSubscriptionMock, readClientBillingState } from "@/src/lib/billing/client";
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-zinc-500/40 dark:focus-visible:ring-offset-zinc-950";

function legacyLocalLabel(status: "free" | "pro_pending" | "pro" | "canceled"): string {
  if (status === "pro_pending") return "Pro (pending, local only)";
  if (status === "pro") return "Pro (local only)";
  if (status === "canceled") return "Canceled (local only)";
  return "Free (local only)";
}

export function UpgradeSuccessPanel() {
  const productionEnvironment = process.env.NODE_ENV === "production";
  const [status, setStatus] = useState<"free" | "pro_pending" | "pro" | "canceled">(
    () => readClientBillingState().status,
  );
  const [notice, setNotice] = useState<string | null>(null);

  const resetLocalPreview = () => {
    if (productionEnvironment) return;
    const next = cancelSubscriptionMock();
    setStatus(next.status);
    setNotice("Local preview state cleared to canceled/free (browser only — server unchanged).");
  };

  return (
    <section aria-label="Developer local billing preview result" className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Local preview step finished. Stored label for this browser:{" "}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{legacyLocalLabel(status)}</span>
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        For real Pro limits, operators grant manual entitlement server-side — refresh <span className="font-medium">/upgrade</span>
        afterward.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/settings"
          className={`inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 ${FOCUS_RING}`}
        >
          Go to settings
        </Link>
        <Link
          href="/upgrade"
          className={`inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 ${FOCUS_RING}`}
        >
          Back to Pro access
        </Link>
        <button
          type="button"
          onClick={resetLocalPreview}
          disabled={productionEnvironment}
          className={`inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 ${FOCUS_RING}`}
        >
          {productionEnvironment ? "Unavailable in production" : "Reset local preview only (dev)"}
        </button>
      </div>
      {notice ? <p className="text-xs text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite">{notice}</p> : null}
    </section>
  );
}
