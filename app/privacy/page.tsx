import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Promi privacy notice for invite-only beta participants.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Privacy Policy (Beta)</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Promi is currently an invite-only beta service. This page summarizes how Promi handles data for beta use.
        </p>
      </header>

      <section className="space-y-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
        <p>
          Promi processes account and connected-platform data only to provide the core product features you use, such
          as connecting accounts, scheduling content, and publishing content at your request.
        </p>
        <p>
          Promi connects to social platforms only when you authorize access. Access tokens are used only for
          connected-account functionality and are not used for unrelated purposes.
        </p>
        <p>
          Promi may retain operational logs and related service data needed for reliability and security during beta
          operation.
        </p>
        <p>
          To request deletion of your account or associated data, contact the operator/admin for your deployment and
          ask for account/data deletion.
        </p>
      </section>
    </div>
  );
}
