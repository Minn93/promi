"use client";

import Link from "next/link";
import { useState } from "react";
import { confirmMockUpgrade, readClientBillingState, startMockUpgrade } from "@/src/lib/billing/client";
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-zinc-500/40 dark:focus-visible:ring-offset-zinc-950";

function legacyLocalLabel(status: "free" | "pro_pending" | "pro" | "canceled"): string {
  if (status === "pro_pending") return "Pro (pending, local only)";
  if (status === "pro") return "Pro (local only)";
  if (status === "canceled") return "Canceled (local only)";
  return "Free (local only)";
}

export function MockCheckoutPanel() {
  const productionEnvironment = process.env.NODE_ENV === "production";
  const [status, setStatus] = useState<"free" | "pro_pending" | "pro" | "canceled">(
    () => readClientBillingState().status,
  );
  const [busy, setBusy] = useState(false);

  const runDevSimulation = () => {
    if (productionEnvironment) return;
    setBusy(true);
    if (status === "free" || status === "canceled") {
      const pending = startMockUpgrade();
      setStatus(pending.status);
    }
    window.setTimeout(() => {
      const next = confirmMockUpgrade();
      setStatus(next.status);
      window.location.href = "/upgrade/success";
    }, 450);
  };

  return (
    <section aria-label="Developer local billing preview panel" className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status" aria-live="polite">
        Legacy localStorage preview label:{" "}
        <span className="font-medium text-zinc-800 dark:text-zinc-100">{legacyLocalLabel(status)}</span>
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        This path is for local testing only. It never updates <span className="font-medium">owner_entitlements</span> on the
        server.
      </p>
      {productionEnvironment ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Production routes redirect away from this page — you should not see this panel in production.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={runDevSimulation}
          disabled={productionEnvironment || busy || status === "pro"}
          className={`inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 ${FOCUS_RING}`}
        >
          {productionEnvironment
            ? "Unavailable in production"
            : busy
              ? "Running…"
              : status === "pro"
                ? "Already marked Pro (local)"
                : "Run local preview (dev)"}
        </button>
        <Link
          href="/upgrade"
          className={`inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 ${FOCUS_RING}`}
        >
          Back to Pro access
        </Link>
      </div>
    </section>
  );
}
