import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { getPlanTierForOwner } from "@/src/lib/plans/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type MetricTone = "default" | "success" | "warning" | "danger";

type MetricCardProps = {
  label: string;
  value: string;
  hint?: string;
  tone?: MetricTone;
};

function formatAt(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function platformLabel(platform: "x" | "instagram" | "facebook"): string {
  if (platform === "x") return "X";
  if (platform === "instagram") return "Instagram";
  return "Facebook";
}

function toneClassName(tone: MetricTone): string {
  if (tone === "danger") return "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30";
  if (tone === "warning") return "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30";
  if (tone === "success") return "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30";
  return "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950";
}

function MetricCard({ label, value, hint, tone = "default" }: MetricCardProps) {
  return (
    <article className={`rounded-lg border p-4 ${toneClassName(tone)}`}>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{hint}</p> : null}
    </article>
  );
}

function canAccessOps(ownerId: string): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.PROMI_ENABLE_OPS_DASHBOARD === "1") return true;
  const allowed = (process.env.PROMI_OPS_OWNER_IDS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return allowed.includes(ownerId);
}

export default async function OpsPage() {
  const ownerId = await getCurrentOwnerId();
  if (!canAccessOps(ownerId)) {
    notFound();
  }

  const [
    totalConnectedAccounts,
    reconnectNeededAccounts,
    activeScheduledPosts,
    publishedPosts,
    failedPosts,
    reconnectNeededPosts,
    ownerRows,
    recentFailedPosts,
    recentReconnectAccounts,
    recentHistory,
  ] = await Promise.all([
    prisma.connectedAccount.count(),
    prisma.connectedAccount.count({ where: { status: { in: ["expired", "revoked", "error"] } } }),
    prisma.scheduledPost.count({ where: { status: { in: ["scheduled", "processing", "failed", "needs_reconnect"] } } }),
    prisma.scheduledPost.count({ where: { status: "published" } }),
    prisma.scheduledPost.count({ where: { status: "failed" } }),
    prisma.scheduledPost.count({ where: { status: "needs_reconnect" } }),
    prisma.connectedAccount.findMany({ select: { ownerId: true }, distinct: ["ownerId"] }),
    prisma.scheduledPost.findMany({
      where: { status: { in: ["failed", "needs_reconnect"] } },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        productName: true,
        platform: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        updatedAt: true,
      },
    }),
    prisma.connectedAccount.findMany({
      where: { status: { in: ["expired", "revoked", "error"] } },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        platform: true,
        status: true,
        displayName: true,
        externalAccountId: true,
        lastError: true,
        updatedAt: true,
      },
    }),
    prisma.postHistory.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        eventType: true,
        message: true,
        createdAt: true,
        scheduledPostId: true,
        scheduledPost: {
          select: {
            platform: true,
            status: true,
            productName: true,
          },
        },
      },
    }),
  ]);

  const ownerSet = new Set(ownerRows.map((row) => row.ownerId));
  ownerSet.add(ownerId);
  const distinctOwners = [...ownerSet];
  const freeOwners = distinctOwners.filter((id) => getPlanTierForOwner(id) === "free").length;
  const proOwners = distinctOwners.filter((id) => getPlanTierForOwner(id) === "pro").length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Operations"
        description="Internal service snapshot for Promi reliability, usage, and recent publishing activity."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Distinct owners"
          value={distinctOwners.length.toLocaleString()}
          hint="Current owner model"
        />
        <MetricCard label="Connected accounts" value={totalConnectedAccounts.toLocaleString()} />
        <MetricCard
          label="Reconnect needed"
          value={(reconnectNeededAccounts + reconnectNeededPosts).toLocaleString()}
          hint={`${reconnectNeededAccounts.toLocaleString()} accounts · ${reconnectNeededPosts.toLocaleString()} posts`}
          tone={reconnectNeededAccounts + reconnectNeededPosts > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="Failed posts"
          value={failedPosts.toLocaleString()}
          hint="Needs retry, edit, or reschedule"
          tone={failedPosts > 0 ? "danger" : "success"}
        />
        <MetricCard
          label="Active scheduled posts"
          value={activeScheduledPosts.toLocaleString()}
          hint="Scheduled + processing + failed + reconnect"
        />
        <MetricCard label="Published posts" value={publishedPosts.toLocaleString()} tone="success" />
        <MetricCard label="Free owners" value={freeOwners.toLocaleString()} hint="Plan breakdown" />
        <MetricCard label="Pro owners" value={proOwners.toLocaleString()} hint="Plan breakdown" />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Template storage</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Reusable templates are browser-local in the current architecture, so a reliable global server count is not available yet.
        </p>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <article className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/30">
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">Recent failed publishes</h2>
          {recentFailedPosts.length === 0 ? (
            <p className="mt-2 text-sm text-red-700 dark:text-red-300">No recent failures.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-xs">
              {recentFailedPosts.map((item) => (
                <li key={item.id} className="rounded-md border border-red-200 bg-white/70 px-2.5 py-2 dark:border-red-900/50 dark:bg-red-950/20">
                  <p className="font-medium text-red-800 dark:text-red-200">{item.productName}</p>
                  <p className="mt-0.5 text-red-700 dark:text-red-300">
                    {platformLabel(item.platform)} · {item.status === "needs_reconnect" ? "Needs reconnect" : "Failed"}
                  </p>
                  {item.errorCode || item.errorMessage ? (
                    <p className="mt-0.5 text-red-700 dark:text-red-300">
                      {(item.errorCode ?? "UNKNOWN").slice(0, 40)}
                      {item.errorMessage ? ` · ${item.errorMessage.slice(0, 60)}` : ""}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-red-700 dark:text-red-300">{formatAt(item.updatedAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
          <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-300">Recent reconnect issues</h2>
          {recentReconnectAccounts.length === 0 ? (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">No reconnect issues.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-xs">
              {recentReconnectAccounts.map((item) => (
                <li key={item.id} className="rounded-md border border-amber-200 bg-white/70 px-2.5 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    {item.displayName ?? item.externalAccountId ?? "Connected account"}
                  </p>
                  <p className="mt-0.5 text-amber-700 dark:text-amber-300">
                    {platformLabel(item.platform)} · {item.status}
                  </p>
                  {item.lastError ? (
                    <p className="mt-0.5 text-amber-700 dark:text-amber-300">{item.lastError.slice(0, 60)}</p>
                  ) : null}
                  <p className="mt-0.5 text-amber-700 dark:text-amber-300">{formatAt(item.updatedAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Recent post activity</h2>
          {recentHistory.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">No recent activity.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-xs">
              {recentHistory.map((item) => (
                <li key={item.id} className="rounded-md border border-zinc-200 px-2.5 py-2 dark:border-zinc-800">
                  <p className="font-medium text-zinc-800 dark:text-zinc-200">
                    {item.scheduledPost?.productName ?? "Unknown post"}
                  </p>
                  <p className="mt-0.5 text-zinc-600 dark:text-zinc-300">
                    {(item.eventType ?? "unknown").replaceAll("_", " ")}
                    {item.scheduledPost?.platform ? ` · ${platformLabel(item.scheduledPost.platform)}` : ""}
                    {item.scheduledPost?.status ? ` · ${item.scheduledPost.status}` : ""}
                  </p>
                  {item.message ? <p className="mt-0.5 text-zinc-600 dark:text-zinc-300">{item.message.slice(0, 70)}</p> : null}
                  <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">{formatAt(item.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}
