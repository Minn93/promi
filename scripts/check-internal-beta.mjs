#!/usr/bin/env node

import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

function parseBool(raw, defaultValue) {
  if (raw == null || String(raw).trim() === "") return defaultValue;
  const normalized = String(raw).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function hasNonEmpty(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
}

function logSection(title) {
  process.stdout.write(`\n${title}\n`);
}

function logList(prefix, items) {
  for (const item of items) {
    process.stdout.write(`${prefix} ${item}\n`);
  }
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProd = nodeEnv === "production";
const internalBetaServer = parseBool(process.env.PROMI_INTERNAL_BETA_MODE, true);
const internalBetaClient = parseBool(process.env.NEXT_PUBLIC_PROMI_INTERNAL_BETA_MODE, true);

const errors = [];
const warnings = [];
const infos = [];

if (!hasNonEmpty("DATABASE_URL")) {
  errors.push("Missing DATABASE_URL (required for app boot and Prisma).");
}

if (!isProd) {
  infos.push("Profile: local development / non-production.");
  if (!internalBetaServer) {
    warnings.push("PROMI_INTERNAL_BETA_MODE is off in non-production; internal-beta defaults are recommended.");
  }
  if (!internalBetaClient) {
    warnings.push("NEXT_PUBLIC_PROMI_INTERNAL_BETA_MODE is off in non-production; internal-beta messaging may be hidden.");
  }
} else if (internalBetaServer) {
  infos.push("Profile: production internal beta.");
  if (!internalBetaClient) {
    errors.push("NEXT_PUBLIC_PROMI_INTERNAL_BETA_MODE must be enabled in production internal beta.");
  }
  if (!hasNonEmpty("PROMI_INTERNAL_BETA_OWNER_ID")) {
    errors.push("PROMI_INTERNAL_BETA_OWNER_ID must be set explicitly in production internal beta.");
  }
  if (!hasNonEmpty("CRON_SECRET")) {
    errors.push("CRON_SECRET is required in production for scheduler job authorization.");
  }
  if (!hasNonEmpty("OPENAI_API_KEY")) {
    errors.push("OPENAI_API_KEY is required for core copy generation flow in production internal beta.");
  }

  const hasXOAuthConfig =
    hasNonEmpty("X_CLIENT_ID") && hasNonEmpty("X_CLIENT_SECRET") && hasNonEmpty("X_OAUTH_REDIRECT_URI");
  if (!hasXOAuthConfig) {
    warnings.push("X OAuth env vars are incomplete. Account connection falls back to mock connect behavior.");
  }
  if (process.env.ALLOW_UNAUTH_SCHEDULER_DEV === "1") {
    warnings.push("ALLOW_UNAUTH_SCHEDULER_DEV is enabled; keep this off in production.");
  }
  if (process.env.DISABLE_AUTO_SCHEDULER_DEV === "1") {
    warnings.push("DISABLE_AUTO_SCHEDULER_DEV is enabled; scheduler automation may be blocked.");
  }
} else if (parseBool(process.env.PROMI_AUTH_PRODUCT_READY)) {
  infos.push("Profile: production with PROMI_AUTH_PRODUCT_READY (Auth.js + Prisma User / closed beta posture).");
  if (!hasNonEmpty("AUTH_SECRET") && !hasNonEmpty("NEXTAUTH_SECRET")) {
    errors.push("AUTH_SECRET or NEXTAUTH_SECRET is required when PROMI_AUTH_PRODUCT_READY=1 in production.");
  }
  if (!hasNonEmpty("CRON_SECRET")) {
    errors.push("CRON_SECRET is required in production for scheduler job authorization.");
  }
  if (!hasNonEmpty("OPENAI_API_KEY")) {
    errors.push("OPENAI_API_KEY is required for core copy generation flow in production.");
  }
  if (!hasNonEmpty("UPSTASH_REDIS_REST_URL") || !hasNonEmpty("UPSTASH_REDIS_REST_TOKEN")) {
    errors.push(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production when PROMI_AUTH_PRODUCT_READY=1 (shared rate-limit store; API routes fail closed without it).",
    );
  }
  if (hasNonEmpty("AUTH_USER_PASSWORD")) {
    warnings.push(
      "AUTH_USER_PASSWORD is set while PROMI_AUTH_PRODUCT_READY=1 — env Credentials are ignored for sign-in; prefer removing from production.",
    );
  }

  const hasXOAuthConfig =
    hasNonEmpty("X_CLIENT_ID") && hasNonEmpty("X_CLIENT_SECRET") && hasNonEmpty("X_OAUTH_REDIRECT_URI");
  if (!hasXOAuthConfig) {
    warnings.push("X OAuth env vars are incomplete. Account connection falls back to mock connect behavior.");
  }
  if (process.env.ALLOW_UNAUTH_SCHEDULER_DEV === "1") {
    warnings.push("ALLOW_UNAUTH_SCHEDULER_DEV is enabled; keep this off in production.");
  }
  if (process.env.DISABLE_AUTO_SCHEDULER_DEV === "1") {
    warnings.push("DISABLE_AUTO_SCHEDULER_DEV is enabled; scheduler automation may be blocked.");
  }
} else {
  infos.push(
    "Profile: production — not internal beta and PROMI_AUTH_PRODUCT_READY is off; app shell is blocked via layout until one of those is enabled.",
  );
}

logSection("Promi internal-beta config check");
if (infos.length > 0) {
  logList("[info]", infos);
}
if (warnings.length > 0) {
  logList("[warn]", warnings);
}
if (errors.length > 0) {
  logList("[error]", errors);
}

if (errors.length > 0) {
  process.stdout.write(`\nResult: FAILED (${errors.length} error${errors.length === 1 ? "" : "s"})\n`);
  process.exit(1);
}

process.stdout.write("\nResult: OK\n");
