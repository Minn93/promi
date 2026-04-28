ALTER TYPE "ScheduledPostStatus" ADD VALUE IF NOT EXISTS 'needs_reconnect';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Platform') THEN
    CREATE TYPE "Platform" AS ENUM ('x', 'instagram', 'facebook');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConnectedAccountStatus') THEN
    CREATE TYPE "ConnectedAccountStatus" AS ENUM ('active', 'expired', 'revoked', 'error');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PublishAttemptStatus') THEN
    CREATE TYPE "PublishAttemptStatus" AS ENUM ('success', 'failed');
  END IF;
END $$;

ALTER TABLE "scheduled_posts"
ADD COLUMN IF NOT EXISTS "platform" "Platform" NOT NULL DEFAULT 'instagram',
ADD COLUMN IF NOT EXISTS "account_id" TEXT,
ADD COLUMN IF NOT EXISTS "provider_post_id" TEXT,
ADD COLUMN IF NOT EXISTS "provider_url" TEXT,
ADD COLUMN IF NOT EXISTS "error_code" TEXT;

CREATE TABLE IF NOT EXISTS "connected_accounts" (
  "id" TEXT NOT NULL,
  "platform" "Platform" NOT NULL,
  "status" "ConnectedAccountStatus" NOT NULL DEFAULT 'active',
  "external_account_id" TEXT,
  "display_name" TEXT,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "token_expires_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "connected_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "publish_attempts" (
  "id" TEXT NOT NULL,
  "scheduled_post_id" TEXT NOT NULL,
  "account_id" TEXT,
  "platform" "Platform" NOT NULL,
  "status" "PublishAttemptStatus" NOT NULL,
  "error_code" TEXT,
  "error_message" TEXT,
  "provider_post_id" TEXT,
  "provider_url" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "publish_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "scheduled_posts_platform_status_idx"
ON "scheduled_posts" ("platform", "status");

CREATE INDEX IF NOT EXISTS "scheduled_posts_account_id_idx"
ON "scheduled_posts" ("account_id");

CREATE INDEX IF NOT EXISTS "connected_accounts_platform_status_idx"
ON "connected_accounts" ("platform", "status");

CREATE INDEX IF NOT EXISTS "publish_attempts_scheduled_post_id_created_at_idx"
ON "publish_attempts" ("scheduled_post_id", "created_at");

CREATE INDEX IF NOT EXISTS "publish_attempts_platform_status_idx"
ON "publish_attempts" ("platform", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_posts_account_id_fkey'
  ) THEN
    ALTER TABLE "scheduled_posts"
    ADD CONSTRAINT "scheduled_posts_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "connected_accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'publish_attempts_scheduled_post_id_fkey'
  ) THEN
    ALTER TABLE "publish_attempts"
    ADD CONSTRAINT "publish_attempts_scheduled_post_id_fkey"
    FOREIGN KEY ("scheduled_post_id") REFERENCES "scheduled_posts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'publish_attempts_account_id_fkey'
  ) THEN
    ALTER TABLE "publish_attempts"
    ADD CONSTRAINT "publish_attempts_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "connected_accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
