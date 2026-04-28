ALTER TABLE "publish_attempts"
ADD COLUMN IF NOT EXISTS "raw_response" JSONB;
