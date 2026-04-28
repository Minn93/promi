import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const internalBetaMode = isInternalBetaModeServer();
  const blockedPublicLaunch = isUnsafePublicLaunchAttemptServer();

  if (blockedPublicLaunch) {
    return (
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full bg-zinc-50 font-sans dark:bg-zinc-900">
          <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-10">
            <section className="w-full rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
              <h1 className="text-lg font-semibold">Promi public launch mode is blocked</h1>
              <p className="mt-2">
                Real auth and real billing are not implemented yet. This deployment must run in
                internal beta mode.
              </p>
              <p className="mt-2">
                Set <code>PROMI_INTERNAL_BETA_MODE=1</code> (and
                <code> NEXT_PUBLIC_PROMI_INTERNAL_BETA_MODE=1</code>) to continue internal testing.
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
      <body className="min-h-full font-sans">
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
      </body>
    </html>
  );
}
