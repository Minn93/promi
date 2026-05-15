-- Phase 14.9 — invited users may exist without a password until they accept the invite.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
