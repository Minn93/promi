import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms",
  description: "Promi terms for invite-only beta participants.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Terms of Service (Beta)</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Promi is currently an invite-only beta service. These terms describe how beta participants may use the
          product.
        </p>
      </header>

      <section className="space-y-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
        <p>
          By using Promi, you agree to use the service only for lawful purposes and in compliance with applicable
          platform rules and policies.
        </p>
        <p>
          Promi connects to social platforms only when you explicitly authorize a connection from your account.
          Connected-account access tokens are used only to provide Promi features such as account connection,
          scheduling, and publishing actions you request.
        </p>
        <p>
          Because Promi is in beta, features may change, be limited, or be unavailable at times. Promi may suspend or
          revoke access to protect service reliability, security, or policy compliance.
        </p>
        <p>
          If you want your account or associated data removed, contact the operator/admin for your deployment and
          request account/data deletion.
        </p>
      </section>
    </div>
  );
}
