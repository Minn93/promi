import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { isInternalBetaModeServer } from "@/src/lib/internal-beta-mode";

/** Sliding-window limits (Upstash-compatible window strings). See docs/PHASE14_10_RATE_LIMITS.md */
export const RATE_LIMITS = {
  forgotPassword: { max: 5, window: "1 h" as const },
  resetPassword: { max: 10, window: "1 h" as const },
  acceptInvite: { max: 10, window: "1 h" as const },
  login: { max: 10, window: "15 m" as const },
  generatePerOwner: { max: 30, window: "1 h" as const },
  uploadPerOwner: { max: 20, window: "1 h" as const },
} as const;

export type RateLimitResult =
  | { ok: true }
  | { ok: false; kind: "over_limit" }
  | { ok: false; kind: "store_required" };

export type ConsumeRateLimitOptions = {
  namespace: string;
  identifier: string;
  max: number;
  window: string;
  /**
   * Strict production without Redis: fail by default. Credentials `authorize` cannot return HTTP 429;
   * use `"pass"` to fail-open with a one-time warning (documented in PHASE14_10).
   */
  onStoreMissing?: "fail" | "pass";
};

let redisMemo: Redis | null | undefined;
const limiterCache = new Map<string, Ratelimit>();
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();
let loginStoreMissingWarned = false;

function normalizeWindowForKey(window: string): string {
  return window.replace(/\s+/g, "");
}

function parseWindowToSeconds(window: string): number {
  const compact = window.replace(/\s+/g, "");
  const m = /^(\d+)(ms|s|m|h|d)$/i.exec(compact);
  if (!m) return 3600;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  if (u === "ms") return Math.max(1, Math.ceil(n / 1000));
  if (u === "s") return n;
  if (u === "m") return n * 60;
  if (u === "h") return n * 3600;
  return n * 86400;
}

export function shouldBypassRateLimitsServer(): boolean {
  return isInternalBetaModeServer();
}

/** Production deployments that are not internal beta must use a shared store when limiting (fail closed if missing). */
export function requiresSharedRateLimitStoreServer(): boolean {
  return process.env.NODE_ENV === "production" && !isInternalBetaModeServer();
}

function getRedisClient(): Redis | null {
  if (redisMemo !== undefined) return redisMemo;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    redisMemo = null;
    return null;
  }
  redisMemo = new Redis({ url, token });
  return redisMemo;
}

function getOrCreateLimiter(namespace: string, max: number, window: string, redis: Redis): Ratelimit {
  const cacheKey = `${namespace}:${max}:${normalizeWindowForKey(window)}`;
  const hit = limiterCache.get(cacheKey);
  if (hit) return hit;
  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, window as Duration),
    prefix: `promi:rl:v1:${namespace}`,
  });
  limiterCache.set(cacheKey, rl);
  return rl;
}

function memoryTryConsume(namespace: string, identifier: string, max: number, windowSeconds: number): boolean {
  const key = `${namespace}:${identifier}`;
  const now = Date.now();
  let bucket = memoryBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowSeconds * 1000 };
    memoryBuckets.set(key, bucket);
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

export function sanitizeRateLimitIdentifier(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "empty";
  return trimmed.replace(/[^a-zA-Z0-9:_\-@.]/g, "_").slice(0, 180);
}

/**
 * Hashed identifier for email buckets (does not log or expose the email).
 * Uses AUTH_SECRET/NEXTAUTH_SECRET when set; dev-only pepper otherwise.
 */
export function hashEmailForRateLimit(email: string): string {
  const normalized = email.trim().toLowerCase();
  const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "").trim();
  const key = secret.length > 0 ? secret : "promi-dev-email-rate-limit-pepper";
  return createHmac("sha256", key).update(normalized).digest("hex").slice(0, 32);
}

export function getClientIpFromRequest(request: Request): string {
  return extractClientIpFromHeaders(request.headers);
}

/** For NextAuth `authorize` / server contexts with `headers()` from `next/headers`. */
export function getClientIpFromHeaders(h: Headers): string {
  return extractClientIpFromHeaders(h);
}

function extractClientIpFromHeaders(h: Headers): string {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return sanitizeRateLimitIdentifier(first);
  }
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return sanitizeRateLimitIdentifier(realIp);
  return "unknown";
}

export async function consumeRateLimit(options: ConsumeRateLimitOptions): Promise<RateLimitResult> {
  if (shouldBypassRateLimitsServer()) return { ok: true };

  const identifier = sanitizeRateLimitIdentifier(options.identifier);
  const redis = getRedisClient();
  if (redis) {
    const limiter = getOrCreateLimiter(options.namespace, options.max, options.window, redis);
    const outcome = await limiter.limit(identifier);
    void outcome.pending;
    return outcome.success ? { ok: true } : { ok: false, kind: "over_limit" };
  }

  const strict = requiresSharedRateLimitStoreServer();
  if (strict) {
    if (options.onStoreMissing === "pass") {
      if (!loginStoreMissingWarned) {
        console.warn(
          "[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing; login rate limits are disabled (fail-open). Configure Upstash Redis for production.",
        );
        loginStoreMissingWarned = true;
      }
      return { ok: true };
    }
    return { ok: false, kind: "store_required" };
  }

  const windowSeconds = parseWindowToSeconds(options.window);
  const allowed = memoryTryConsume(options.namespace, identifier, options.max, windowSeconds);
  return allowed ? { ok: true } : { ok: false, kind: "over_limit" };
}

export function rateLimitFailureResponse(result: Extract<RateLimitResult, { ok: false }>): NextResponse {
  if (result.kind === "store_required") {
    return NextResponse.json(
      {
        error: "service_unavailable",
        message: "Service temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  }
  return NextResponse.json(
    {
      error: "too_many_requests",
      message: "Too many requests. Please try again later.",
    },
    { status: 429 },
  );
}
