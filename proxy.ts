import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isInternalBetaModeServer } from "@/src/lib/internal-beta-mode";

const PROTECTED_PAGE_PREFIXES = [
  "/create",
  "/scheduled",
  "/history",
  "/analytics",
  "/settings",
  "/ops",
];

const PROTECTED_API_PREFIXES = [
  "/api/scheduled-posts",
  "/api/post-history",
  "/api/connected-accounts",
  "/api/oauth/",
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

  const signInUrl = new URL("/api/auth/signin", request.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", request.nextUrl.href);
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
    "/ops/:path*",
    "/api/scheduled-posts/:path*",
    "/api/post-history/:path*",
    "/api/connected-accounts/:path*",
    "/api/oauth/:path*",
  ],
};
