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
} else {
  infos.push("Profile: production public mode request (unsafe until real auth + real billing are implemented).");
  infos.push("Expected behavior: app blocks startup via internal-beta safety guard.");
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
