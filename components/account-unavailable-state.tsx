import Link from "next/link";

type AccountUnavailableStateProps = {
  title: string;
  description: string;
};

export function AccountUnavailableState({ title, description }: AccountUnavailableStateProps) {
  return (
    <>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
        <p className="font-medium text-zinc-900 dark:text-zinc-50">{title}</p>
        <p className="mt-2">This account is not available right now.</p>
        <p className="mt-1">
          If this persists, contact support or your workspace operator.
        </p>
        <div className="mt-3">
          <Link
            href="/"
            className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50"
          >
            Back to home
          </Link>
        </div>
      </div>
    </>
  );
}
