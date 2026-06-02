import Link from "next/link";
import { getServerSession } from "next-auth";
import { AuthSignOutButton } from "@/components/auth-sign-out-button";
import { LoginForm } from "@/components/login-form";
import { authOptions } from "@/src/lib/auth/next-auth";
import { isPublicBetaSignupEnabledServer } from "@/src/lib/internal-beta-mode";

function sanitizeCallbackUrl(raw: string | string[] | undefined): string {
  const picked = Array.isArray(raw) ? raw[0] : raw;
  if (!picked) return "/";
  const trimmed = picked.trim();
  if (!trimmed.startsWith("/")) return "/";
  if (trimmed.startsWith("//")) return "/";
  return trimmed;
}

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getServerSession(authOptions);
  const publicSignupEnabled = isPublicBetaSignupEnabledServer();
  const params = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(params.callbackUrl);
  const signedInEmail =
    session?.user?.email && typeof session.user.email === "string" ? session.user.email.trim().toLowerCase() : null;

  if (signedInEmail) {
    const continueHref = callbackUrl || "/";
    return (
      <div className="mx-auto w-full max-w-md space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Sign in to Promi</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            You are already signed in as <span className="font-medium text-zinc-800 dark:text-zinc-100">{signedInEmail}</span>.
          </p>
        </div>
        <div className="space-y-3">
          <Link
            href={continueHref}
            className="inline-flex w-full items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Continue to app
          </Link>
          <AuthSignOutButton
            label="Sign out and switch account"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <LoginForm callbackUrl={callbackUrl} showSignupLink={publicSignupEnabled} />
    </div>
  );
}
