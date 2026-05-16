import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getServerSession } from "next-auth";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { authOptions } from "@/src/lib/auth/next-auth";
import { isInternalBetaModeServer, isUnsafePublicLaunchAttemptServer } from "@/src/lib/internal-beta-mode";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Promi",
    template: "%s · Promi",
  },
  description: "Promi — SaaS dashboard for promotions",
};

function readAuthenticatedUserId(session: unknown): string | null {
  if (!session || typeof session !== "object") return null;
  const raw = (session as { user?: { id?: unknown } }).user?.id;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const internalBetaMode = isInternalBetaModeServer();
  const blockedPublicLaunch = isUnsafePublicLaunchAttemptServer();
  const session = await getServerSession(authOptions);
  const authenticatedUserId = readAuthenticatedUserId(session);
  const showAuthenticatedShell = internalBetaMode || Boolean(authenticatedUserId);

  if (blockedPublicLaunch) {
    return (
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full bg-zinc-50 font-sans dark:bg-zinc-900">
          <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-10">
            <section className="w-full rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
              <h1 className="text-lg font-semibold">Promi production app shell is blocked</h1>
              <p className="mt-2">
                This deployment has <code>PROMI_INTERNAL_BETA_MODE=0</code> without product-ready auth enabled. The
                dashboard is not available until you either run in internal beta or explicitly enable Auth MVP.
              </p>
              <p className="mt-2">
                For internal testing, set <code>PROMI_INTERNAL_BETA_MODE=1</code> and{" "}
                <code>NEXT_PUBLIC_PROMI_INTERNAL_BETA_MODE=1</code>.
              </p>
              <p className="mt-2">
                For closed beta with DB-backed Auth.js, set <code>PROMI_AUTH_PRODUCT_READY=1</code>, provision users via{" "}
                <code>npm run auth:user</code>, and keep <code>PROMI_PUBLIC_APP_READY</code> / public signup off —
                see <code>docs/PHASE14_4_AUTH_USER_MODEL.md</code>.
              </p>
            </section>
          </main>
        </body>
      </html>
    );
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className="min-h-full font-sans"
        data-promi-owner-id={authenticatedUserId ?? ""}
      >
        {showAuthenticatedShell ? (
          <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-900">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar />
              {internalBetaMode ? (
                <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100 md:px-8">
                  Internal beta mode: single-owner dev auth and simulated billing are enabled.
                </div>
              ) : null}
              <main className="flex-1 p-6 md:p-8">{children}</main>
            </div>
          </div>
        ) : (
          <main className="min-h-screen bg-zinc-50 p-6 dark:bg-zinc-900 md:p-8">{children}</main>
        )}
      </body>
    </html>
  );
}
