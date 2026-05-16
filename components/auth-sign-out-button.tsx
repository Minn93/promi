"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

type AuthSignOutButtonProps = {
  label?: string;
  className?: string;
};

export function AuthSignOutButton({
  label = "Sign out",
  className = "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
}: AuthSignOutButtonProps) {
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await signOut({ callbackUrl: "/login" });
    } catch {
      setPending(false);
    }
  }

  return (
    <button type="button" onClick={onClick} disabled={pending} className={className}>
      {pending ? "Signing out…" : label}
    </button>
  );
}
