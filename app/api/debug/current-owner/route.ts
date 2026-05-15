import { NextResponse } from "next/server";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { isAuthProductReadyServer, isInternalBetaModeServer } from "@/src/lib/internal-beta-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Dev-only diagnostic for Phase 14.12: which ownerId the server resolves for this request.
 * Disabled in production (404, empty body).
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const internalBetaMode = isInternalBetaModeServer();
  const authProductReady = isAuthProductReadyServer();

  try {
    const ownerId = await getCurrentOwnerId();
    return NextResponse.json(
      { ownerId, internalBetaMode, authProductReady },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch {
    return NextResponse.json(
      { ownerId: null, internalBetaMode, authProductReady },
      { status: 200, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  }
}
