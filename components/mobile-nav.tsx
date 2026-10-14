"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { AuthSignOutButton } from "@/components/auth-sign-out-button";
import { DashboardNavLinks } from "@/components/sidebar";

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <Link href="/" className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Promi
        </Link>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          Menu
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-900/40"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="absolute inset-y-0 left-0 flex w-[min(100%,18rem)] flex-col border-r border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Promi</span>
              <button
                type="button"
                className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
            <DashboardNavLinks onNavigate={() => setOpen(false)} />
            <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
              <AuthSignOutButton
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
