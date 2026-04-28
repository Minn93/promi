ALTER TABLE "connected_accounts"
ADD COLUMN IF NOT EXISTS "owner_id" TEXT NOT NULL DEFAULT 'local-dev-user';

CREATE INDEX IF NOT EXISTS "connected_accounts_owner_platform_status_idx"
ON "connected_accounts" ("owner_id", "platform", "status");
