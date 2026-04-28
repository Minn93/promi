ALTER TABLE "connected_accounts"
ADD COLUMN IF NOT EXISTS "metadata_json" JSONB;
