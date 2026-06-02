#!/usr/bin/env node

/**
 * Phase 14.4+ — Auth users / tokens (ops). Phase 14.9 — `invite` creates passwordless row + optional Resend mail.
 * Loads .env then .env.local. Mutations require --confirm. Never prints password hashes.
 * Plaintext tokens are never printed in production.
 */

import { createHmac, randomBytes } from "node:crypto";
import path from "node:path";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const BCRYPT_COST = 12;
const INVITE_MAX_EXPIRES_MIN = 60 * 24 * 14;
const PASSWORD_RESET_MAX_MIN = 60;
const VALID_ACTIONS = new Set([
  "create",
  "disable",
  "enable",
  "status",
  "invite",
  "rotate-invite",
  "issue-reset-token",
  "issue-invite-token",
]);

const TOKEN_TYPE = {
  password_reset: "password_reset",
  invite_accept: "invite_accept",
};

function parseDatabaseTarget(connectionString) {
  const raw = String(connectionString ?? "").trim();
  if (!raw) {
    return { kind: "unknown", summary: "<empty>" };
  }
  try {
    const u = new URL(raw);
    const host = (u.hostname || "").toLowerCase();
    const dbName = u.pathname?.replace(/^\/+/, "") || "<default>";
    const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    const isLocal = localHosts.has(host);
    return {
      kind: isLocal ? "local" : "remote",
      summary: `${u.protocol}//${host}/${dbName}`,
    };
  } catch {
    const scrubbed = raw.replace(/:[^:@/]*@/, ":***@");
    return { kind: "unknown", summary: scrubbed.slice(0, 120) };
  }
}

function isTruthyFlag(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (const raw of argv) {
    if (raw === "--confirm") {
      out.confirm = true;
      continue;
    }
    if (raw.startsWith("--") && raw.includes("=")) {
      const idx = raw.indexOf("=");
      const key = raw.slice(2, idx);
      const value = raw.slice(idx + 1);
      out[key] = value;
      continue;
    }
    if (raw.startsWith("--")) {
      out[raw.slice(2)] = true;
      continue;
    }
  }
  return out;
}

function normalizeEmail(raw) {
  if (typeof raw !== "string" || !raw.trim()) return "";
  return raw.trim().toLowerCase();
}

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

function getTokenPepper() {
  const s = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "").trim();
  if (!s) throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required for token hashing");
  return s;
}

function hashRawToken(raw) {
  return createHmac("sha256", getTokenPepper()).update(raw, "utf8").digest("hex");
}

function newUrlSafeToken() {
  return randomBytes(32).toString("base64url");
}

function parseExpiresMinutesInvite(raw) {
  const fallback = 4320;
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0 || n > INVITE_MAX_EXPIRES_MIN) {
    throw new Error(`expiresMinutes for invite must be between 1 and ${INVITE_MAX_EXPIRES_MIN}`);
  }
  return n;
}

function parsePasswordResetExpires(raw) {
  const fallback = 60;
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0 || n > PASSWORD_RESET_MAX_MIN) {
    throw new Error(`expiresMinutes for password_reset must be between 1 and ${PASSWORD_RESET_MAX_MIN}`);
  }
  return n;
}

function parseIssueInviteExpires(raw) {
  const fallback = 4320;
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0 || n > INVITE_MAX_EXPIRES_MIN) {
    throw new Error(`expiresMinutes for invite_accept must be between 1 and ${INVITE_MAX_EXPIRES_MIN}`);
  }
  return n;
}

function isMailStrictEnvironment() {
  if (process.env.NODE_ENV === "production") return true;
  const v = (process.env.PROMI_AUTH_PRODUCT_READY ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function devEmailLogEnabled() {
  const v = process.env.PROMI_AUTH_EMAIL_DEV_LOG?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function mailFromAddress() {
  return process.env.PROMI_MAIL_FROM?.trim() || "Promi <noreply@usepromi.app>";
}

function summarizeMailFrom() {
  const configured = process.env.PROMI_MAIL_FROM?.trim() || "";
  const effective = mailFromAddress();
  const parsed = /^(.*?)<([^>]+)>$/.exec(effective);
  const displayName = (parsed?.[1] ?? "").trim();
  const addr = (parsed?.[2] ?? effective).trim();
  const at = addr.lastIndexOf("@");
  const domain = at >= 0 ? addr.slice(at + 1).toLowerCase() : null;
  const localPart = at >= 0 ? addr.slice(0, at) : addr;
  const redactedLocal =
    localPart.length <= 2 ? `${localPart[0] ?? "*"}*` : `${localPart.slice(0, 2)}***`;
  const redactedEmail = domain ? `${redactedLocal}@${domain}` : `${redactedLocal}`;
  return {
    promiMailFromDetected: configured.length > 0,
    senderDomain: domain,
    senderRedacted: displayName ? `${displayName} <${redactedEmail}>` : redactedEmail,
  };
}

function getInviteMailBaseUrl() {
  for (const key of ["PROMI_APP_URL", "NEXT_PUBLIC_APP_URL", "NEXTAUTH_URL"]) {
    const raw = process.env[key]?.trim();
    if (!raw) continue;
    try {
      const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
      if (u.hostname) return `${u.protocol}//${u.host}`.replace(/\/+$/, "");
    } catch {
      continue;
    }
  }
  return "http://localhost:3000";
}

/**
 * Mirrors `src/lib/auth/invite-mail.ts` + `sendMail` policy for CLI.
 */
async function sendInviteMailCli(to, rawToken) {
  const base = getInviteMailBaseUrl();
  const inviteUrl = `${base}/accept-invite?token=${encodeURIComponent(rawToken)}`;
  const subject = "You're invited to Promi";
  const text = [
    "You have been invited to create your Promi account.",
    "",
    "Open this link to set your password (it expires in a few days):",
    inviteUrl,
    "",
    "If you did not expect this, you can ignore this email.",
  ].join("\n");

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (apiKey) {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const href = inviteUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const html = `<p>You have been invited to create your Promi account.</p><p><a href="${href}">Accept invite and set password</a></p><p>If you did not expect this, you can ignore this email.</p>`;
    const { error } = await resend.emails.send({
      from: mailFromAddress(),
      to: [to],
      subject,
      text,
      html,
    });
    if (error) {
      throw new Error(`Resend: ${error.message}`);
    }
    return;
  }

  const strict = isMailStrictEnvironment();
  if (strict) {
    throw new Error(
      "mail_misconfigured: RESEND_API_KEY is not set (required in production / when PROMI_AUTH_PRODUCT_READY is enabled)",
    );
  }

  if (devEmailLogEnabled()) {
    const preview = text.length > 280 ? `${text.slice(0, 280)}…` : text;
    console.info("[promi:mail:dev-log]", { to, subject, textPreview: preview });
    return;
  }

  throw new Error(
    "mail_misconfigured: set RESEND_API_KEY, or PROMI_AUTH_EMAIL_DEV_LOG=1 for console logging",
  );
}

async function replaceInviteTokenCli(prisma, userId, expiresMinutes) {
  const rawToken = newUrlSafeToken();
  const tokenHash = hashRawToken(rawToken);
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);
  return prisma.$transaction(async (tx) => {
    await tx.authOneTimeToken.deleteMany({
      where: {
        userId,
        type: TOKEN_TYPE.invite_accept,
        consumedAt: null,
      },
    });
    const row = await tx.authOneTimeToken.create({
      data: {
        userId,
        type: TOKEN_TYPE.invite_accept,
        tokenHash,
        expiresAt,
      },
    });
    return { row, rawToken };
  });
}

async function purgeInviteAndPasswordResetTokensCli(prisma, userId) {
  const deletedInvite = await prisma.authOneTimeToken.deleteMany({
    where: {
      userId,
      type: TOKEN_TYPE.invite_accept,
    },
  });
  const deletedReset = await prisma.authOneTimeToken.deleteMany({
    where: {
      userId,
      type: TOKEN_TYPE.password_reset,
    },
  });
  return {
    inviteDeletedCount: deletedInvite.count,
    passwordResetDeletedCount: deletedReset.count,
    totalDeletedCount: deletedInvite.count + deletedReset.count,
  };
}

async function replacePasswordResetTokenCli(prisma, userId, expiresMinutes) {
  const rawToken = newUrlSafeToken();
  const tokenHash = hashRawToken(rawToken);
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);
  return prisma.$transaction(async (tx) => {
    await tx.authOneTimeToken.deleteMany({
      where: {
        userId,
        type: TOKEN_TYPE.password_reset,
        consumedAt: null,
      },
    });
    const row = await tx.authOneTimeToken.create({
      data: {
        userId,
        type: TOKEN_TYPE.password_reset,
        tokenHash,
        expiresAt,
      },
    });
    return { row, rawToken };
  });
}

function printStatus(row) {
  if (!row) {
    console.log(JSON.stringify({ found: false }, null, 2));
    return;
  }
  console.log(
    JSON.stringify(
      {
        found: true,
        id: row.id,
        email: row.email,
        pendingPasswordSetup: row.passwordHash == null,
        disabled: row.disabled,
        emailVerified: row.emailVerified ? row.emailVerified.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
      null,
      2,
    ),
  );
}

function printTokenResult(isProd, row, user, rawToken, devNote) {
  if (isProd) {
    console.info(
      JSON.stringify(
        {
          tokenId: row.id,
          userId: user.id,
          email: user.email,
          type: row.type,
          expiresAt: row.expiresAt.toISOString(),
          note: devNote,
        },
        null,
        2,
      ),
    );
    return;
  }
  console.error("SENSITIVE dev-only: plaintext token follows on stdout (do not commit logs).");
  console.log(
    JSON.stringify(
      {
        tokenId: row.id,
        userId: user.id,
        email: user.email,
        type: row.type,
        expiresAt: row.expiresAt.toISOString(),
        rawToken,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = typeof args.action === "string" ? args.action : "";
  const email = normalizeEmail(args.email ?? "");
  const dbTarget = parseDatabaseTarget(process.env.DATABASE_URL);
  const isProd = process.env.NODE_ENV === "production";

  if (!VALID_ACTIONS.has(action)) {
    console.error(
      "Usage: npm run auth:user -- --action=create|invite|rotate-invite|disable|enable|status|issue-reset-token|issue-invite-token --email=<email> [--password=<password>] [--expiresMinutes=<n>] [--confirm]",
    );
    process.exitCode = 2;
    return;
  }

  if (!email) {
    console.error("Missing required --email=");
    process.exitCode = 2;
    return;
  }

  const prisma = createPrismaClient();

  const allowRemoteDbMutations = isTruthyFlag(process.env.PROMI_AUTH_CLI_ALLOW_REMOTE_DB_MUTATIONS);
  console.info(
    `[auth:user] database_target=${dbTarget.kind} (${dbTarget.summary}) node_env=${isProd ? "production" : "non-production"}`,
  );
  if (!isProd && dbTarget.kind === "remote" && action !== "status" && !allowRemoteDbMutations) {
    console.error(
      "Refusing mutating auth:user action against a remote DATABASE_URL from non-production runtime.",
    );
    console.error(
      "If intentional, set PROMI_AUTH_CLI_ALLOW_REMOTE_DB_MUTATIONS=1 for this command invocation.",
    );
    process.exitCode = 2;
    await prisma.$disconnect();
    return;
  }

  try {
    if (action === "status") {
      const row = await prisma.user.findUnique({ where: { email } });
      printStatus(row);
      return;
    }

    const needConfirm = args.confirm !== true;
    if (needConfirm) {
      console.error(`${action} requires --confirm`);
      process.exitCode = 2;
      return;
    }

    if (action === "create") {
      const password = typeof args.password === "string" ? args.password : "";
      if (password.length < 8) {
        console.error("create requires --password= with length >= 8");
        process.exitCode = 2;
        return;
      }
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        console.error("User already exists for this email. Use disable/enable or choose another email.");
        process.exitCode = 1;
        return;
      }
      const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
      const row = await prisma.user.create({
        data: {
          email,
          passwordHash,
        },
      });
      console.info("User created.");
      console.info("id=", row.id, "(maps to Promi owner_id)");
      console.info("email=", row.email);
      return;
    }

    if (action === "invite") {
      const expiresMinutes = parseExpiresMinutesInvite(args.expiresMinutes);
      const senderInfo = summarizeMailFrom();
      console.info("[auth:invite] sender_config", senderInfo);
      if (isMailStrictEnvironment() && !process.env.RESEND_API_KEY?.trim()) {
        console.error("invite requires RESEND_API_KEY in production or when PROMI_AUTH_PRODUCT_READY is enabled.");
        process.exitCode = 1;
        return;
      }

      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({
          data: { email, passwordHash: null },
        });
        console.info("Invited user row created (password pending).");
        console.info("id=", user.id, "(maps to Promi owner_id)");
      } else {
        if (user.disabled) {
          console.error("User is disabled; enable before inviting.");
          process.exitCode = 1;
          return;
        }
        if (user.passwordHash != null) {
          console.error("User already has a password. Use forgot-password / reset for existing accounts, or pick another email.");
          process.exitCode = 1;
          return;
        }
      }

      const { row, rawToken } = await replaceInviteTokenCli(prisma, user.id, expiresMinutes);
      try {
        await sendInviteMailCli(user.email, rawToken);
      } catch (err) {
        console.error(
          "[auth:invite] mail_failed",
          err instanceof Error ? err.message : String(err),
          senderInfo,
        );
        process.exitCode = 1;
        return;
      }

      const base = getInviteMailBaseUrl();
      const tokenPreview = `${rawToken.slice(0, 6)}…${rawToken.slice(-4)}`;
      console.info(
        JSON.stringify(
          {
            ok: true,
            userId: user.id,
            email: user.email,
            tokenId: row.id,
            tokenPreview,
            expiresAt: row.expiresAt.toISOString(),
            inviteBaseUrl: base,
            senderDomain: senderInfo.senderDomain,
            senderRedacted: senderInfo.senderRedacted,
            note: "Invite email sent. Plaintext token is intentionally not printed.",
          },
          null,
          2,
        ),
      );
      return;
    }

    if (action === "rotate-invite") {
      const expiresMinutes = parseExpiresMinutesInvite(args.expiresMinutes);
      const senderInfo = summarizeMailFrom();
      console.info("[auth:rotate-invite] sender_config", senderInfo);
      if (isMailStrictEnvironment() && !process.env.RESEND_API_KEY?.trim()) {
        console.error("rotate-invite requires RESEND_API_KEY in production or when PROMI_AUTH_PRODUCT_READY is enabled.");
        process.exitCode = 1;
        return;
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        console.error("No user found for email.");
        process.exitCode = 1;
        return;
      }
      if (user.disabled) {
        console.error("User is disabled; enable before rotating invite.");
        process.exitCode = 1;
        return;
      }
      if (user.passwordHash != null) {
        console.error("User already has a password. Invite onboarding is no longer valid; use login or forgot-password.");
        process.exitCode = 1;
        return;
      }

      const revoked = await purgeInviteAndPasswordResetTokensCli(prisma, user.id);
      const { row, rawToken } = await replaceInviteTokenCli(prisma, user.id, expiresMinutes);
      const tokenHash = hashRawToken(rawToken);
      const hashLookup = await prisma.authOneTimeToken.findUnique({
        where: {
          type_tokenHash: {
            type: TOKEN_TYPE.invite_accept,
            tokenHash,
          },
        },
        select: { id: true, userId: true },
      });
      const hashLookupMatched = hashLookup?.id === row.id && hashLookup.userId === user.id;

      try {
        await sendInviteMailCli(user.email, rawToken);
      } catch (err) {
        console.error(
          "[auth:rotate-invite] mail_failed",
          err instanceof Error ? err.message : String(err),
          senderInfo,
        );
        process.exitCode = 1;
        return;
      }

      const base = getInviteMailBaseUrl();
      const tokenPreview = `${rawToken.slice(0, 6)}…${rawToken.slice(-4)}`;
      console.info(
        JSON.stringify(
          {
            ok: true,
            action: "rotate-invite",
            userId: user.id,
            email: user.email,
            revoked,
            tokenId: row.id,
            tokenPreview,
            tokenExpiresAt: row.expiresAt.toISOString(),
            tokenHashLookupMatched: hashLookupMatched,
            inviteUrlHost: base,
            senderDomain: senderInfo.senderDomain,
            senderRedacted: senderInfo.senderRedacted,
            note: "Old invite/password-reset tokens removed; fresh invite token created and email sent. Plaintext token is intentionally not printed.",
          },
          null,
          2,
        ),
      );
      return;
    }

    if (action === "disable") {
      const row = await prisma.user.updateMany({
        where: { email },
        data: { disabled: true },
      });
      if (row.count === 0) {
        console.error("No user found for email.");
        process.exitCode = 1;
        return;
      }
      console.info("User disabled.");
      return;
    }

    if (action === "enable") {
      const row = await prisma.user.updateMany({
        where: { email },
        data: { disabled: false },
      });
      if (row.count === 0) {
        console.error("No user found for email.");
        process.exitCode = 1;
        return;
      }
      console.info("User enabled.");
      return;
    }

    if (action === "issue-reset-token") {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        console.error("No user found for email.");
        process.exitCode = 1;
        return;
      }
      if (user.disabled) {
        console.error("User is disabled; enable before issuing tokens.");
        process.exitCode = 1;
        return;
      }
      if (user.passwordHash == null) {
        console.error("User has not set a password yet; use --action=invite or issue-invite-token for onboarding.");
        process.exitCode = 1;
        return;
      }
      const expiresMinutes = parsePasswordResetExpires(args.expiresMinutes);
      const { row, rawToken } = await replacePasswordResetTokenCli(prisma, user.id, expiresMinutes);
      printTokenResult(
        isProd,
        row,
        user,
        rawToken,
        "Plaintext token not printed in production; send via transactional email.",
      );
      return;
    }

    if (action === "issue-invite-token") {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        console.error("No user found for email.");
        process.exitCode = 1;
        return;
      }
      if (user.disabled) {
        console.error("User is disabled; enable before issuing tokens.");
        process.exitCode = 1;
        return;
      }
      if (user.passwordHash != null) {
        console.error("User already has a password; invite_accept is only for pending onboarding.");
        process.exitCode = 1;
        return;
      }
      const expiresMinutes = parseIssueInviteExpires(args.expiresMinutes);
      const { row, rawToken } = await replaceInviteTokenCli(prisma, user.id, expiresMinutes);
      printTokenResult(
        isProd,
        row,
        user,
        rawToken,
        "Plaintext token not printed in production; use --action=invite to email, or send manually.",
      );
      return;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
