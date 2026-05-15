import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isInternalBetaModeServer } from "@/src/lib/internal-beta-mode";

/**
 * Edge guard for real-auth mode only (`PROMI_INTERNAL_BETA_MODE=0`).
 * Does not run for: `/api/auth/*`, webhooks, scheduler (omit from `config.matcher`).
 * Route handlers remain authoritative for `getCurrentOwnerId()` and business auth.
 */
const PROTECTED_PAGE_PREFIXES = [
  "/create",
  "/scheduled",
  "/history",
  "/analytics",
  "/settings",
  "/upgrade",
  "/products",
  "/drafts",
  "/performance",
  "/ops",
];

const PROTECTED_API_PREFIXES = [
  "/api/scheduled-posts",
  "/api/post-history",
  "/api/connected-accounts",
  "/api/oauth/",
  "/api/generate",
  "/api/uploads/",
  "/api/billing/",
];

function isProtectedPagePath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PROTECTED_PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isProtectedApiPath(pathname: string): boolean {
  return PROTECTED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export default async function proxy(request: NextRequest) {
  if (isInternalBetaModeServer()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const protectedPath = isProtectedPagePath(pathname) || isProtectedApiPath(pathname);
  if (!protectedPath) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  });

  if (typeof token?.sub === "string" && token.sub.trim().length > 0) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Authentication required.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const signInUrl = new URL("/login", request.nextUrl.origin);
  const callbackUrl = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  signInUrl.searchParams.set("callbackUrl", callbackUrl);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    "/",
    "/create/:path*",
    "/scheduled/:path*",
    "/history/:path*",
    "/analytics/:path*",
    "/settings/:path*",
    "/upgrade/:path*",
    "/products/:path*",
    "/drafts/:path*",
    "/performance/:path*",
    "/ops/:path*",
    "/api/scheduled-posts/:path*",
    "/api/post-history/:path*",
    "/api/connected-accounts/:path*",
    "/api/oauth/:path*",
    "/api/generate",
    "/api/uploads/:path*",
    "/api/billing/:path*",
  ],
};
