"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

type LoginFormProps = {
  callbackUrl: string;
  showSignupLink: boolean;
};

export function LoginForm({ callbackUrl, showSignupLink }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        callbackUrl,
        redirect: false,
      });
      if (!res || res.error) {
        setError("Invalid email or password.");
        setPending(false);
        return;
      }
      const next = typeof res.url === "string" && res.url.trim().length > 0 ? res.url : callbackUrl;
      router.push(next);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Sign in to Promi</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {showSignupLink
            ? "Promi is currently in public beta (limited)."
            : "Promi is currently available by invite only."}
        </p>
      </div>

      <div>
        <label htmlFor="login-email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Email
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div>
        <label htmlFor="login-password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      {error ? (
        <p id="login-error" className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <div className="space-y-1 text-center text-sm text-zinc-600 dark:text-zinc-400">
        <p>If you received an invite, use the email address associated with your invite.</p>
        <p>
          <Link href="/forgot-password" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100">
            Forgot password
          </Link>
        </p>
        {showSignupLink ? (
          <p>
            New here?{" "}
            <Link href="/signup" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100">
              Try the beta
            </Link>
          </p>
        ) : null}
      </div>
    </form>
  );
}
