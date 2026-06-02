import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/src/lib/auth/next-auth";
import { isPublicBetaSignupEnabledServer } from "@/src/lib/internal-beta-mode";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  const signedIn = typeof session?.user?.id === "string" && session.user.id.trim().length > 0;
  const publicSignupEnabled = isPublicBetaSignupEnabledServer();
  const inviteEmail = process.env.PROMI_UPGRADE_REQUEST_EMAIL?.trim();
  const inviteMailto = inviteEmail
    ? `mailto:${inviteEmail}?subject=${encodeURIComponent("Promi beta invite request")}`
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10">
      <section
        aria-labelledby="landing-hero-heading"
        className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 md:p-10"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {publicSignupEnabled ? "Public beta (limited)" : "Invite-only closed beta"}
        </p>
        <h1
          id="landing-hero-heading"
          className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-4xl"
        >
          Promi helps you turn product or campaign ideas into scheduled promotional posts.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 md:text-base">
          Write promotional posts faster, connect your X/Twitter account, schedule posts, and
          review publishing history from one focused workspace built for practical day-to-day
          promotion work.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {publicSignupEnabled ? (
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Start public beta
            </Link>
          ) : (
            <a
              href={inviteMailto ?? "#request-invite"}
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Request invite
            </a>
          )}
          {signedIn ? (
            <Link
              href="/create"
              className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Open workspace
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Sign in
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            The problem
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            Writing promotional posts from scratch is slow and easy to postpone, especially when
            you are running a store, shipping orders, and handling customer messages.
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Built for
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
            <li>Online sellers and small business owners</li>
            <li>Creators promoting products or offers</li>
            <li>Solo founders managing promotion themselves</li>
          </ul>
        </article>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950 md:p-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          How Promi works
        </h2>
        <ol className="mt-4 grid gap-3 text-sm text-zinc-600 dark:text-zinc-300 md:grid-cols-2">
          <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            1. Add a product or campaign idea
          </li>
          <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            2. Generate a promotional post draft
          </li>
          <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            3. Connect X/Twitter
          </li>
          <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            4. Schedule and publish
          </li>
          <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700 md:col-span-2">
            5. Review publishing history
          </li>
        </ol>
      </section>

      <section
        id="request-invite"
        className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/40 dark:bg-amber-950/30 md:p-8"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
          Current beta status
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-amber-900 dark:text-amber-100">
          <li>{publicSignupEnabled ? "Public beta access is currently enabled" : "Invite-only closed beta access"}</li>
          <li>X/Twitter-focused real publish flow</li>
          <li>Billing is not a live paid launch</li>
          <li>Non-X real publish parity is still partial</li>
          <li>Product direction is feedback-driven during beta</li>
        </ul>
        <p className="mt-4 text-sm text-amber-900 dark:text-amber-100">
          {publicSignupEnabled ? (
            <>
              Public beta is open in a limited rollout. If signup is later paused, invite-only access will continue.
            </>
          ) : inviteMailto ? (
            <>
              To request access, email{" "}
              <a className="font-medium underline" href={inviteMailto}>
                the Promi beta team
              </a>
              .
            </>
          ) : (
            <>
              Access is currently invite-only. Use the Sign in button if you already have an invite.
            </>
          )}
        </p>
      </section>
    </div>
  );
}
