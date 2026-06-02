"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type SignupFormProps = {
  enabled: boolean;
};

export function SignupForm({ enabled }: SignupFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!enabled) return;
    setError(null);
    setSuccess(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.message ?? "Could not create your account right now.");
        setPending(false);
        return;
      }
      setSuccess("Account created. Redirecting to sign in…");
      window.setTimeout(() => {
        router.push("/login");
        router.refresh();
      }, 500);
    } catch {
      setError("Network error. Please try again.");
      setPending(false);
    }
  }

  if (!enabled) {
    return (
      <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
        <p>Public beta signup is currently closed.</p>
        <p>
          If you already have access,{" "}
          <Link href="/login" className="font-medium underline">
            sign in
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Start public beta</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Promi is in public beta. Billing is not live, and X/Twitter is the main real publishing flow.
        </p>
      </div>

      <div>
        <label htmlFor="signup-email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Email
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div>
        <label htmlFor="signup-password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Password
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Use at least 8 characters.</p>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">
          {success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Creating account…" : "Try the beta"}
      </button>

      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        Already have access?{" "}
        <Link href="/login" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100">
          Sign in
        </Link>
      </p>
    </form>
  );
}
