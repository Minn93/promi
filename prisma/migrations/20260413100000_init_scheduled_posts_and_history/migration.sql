-- Create enums
CREATE TYPE "ScheduledPostStatus" AS ENUM ('scheduled', 'processing', 'posted', 'failed', 'cancelled');
CREATE TYPE "PostHistoryEventType" AS ENUM ('scheduled', 'picked_up', 'posted', 'failed', 'cancelled', 'retried');

-- Create scheduled_posts
CREATE TABLE "scheduled_posts" (
  "id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "product_name" TEXT NOT NULL,
  "image_url" TEXT,
  "channels" JSONB NOT NULL,
  "content_payload" JSONB NOT NULL,
  "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
  "status" "ScheduledPostStatus" NOT NULL DEFAULT 'scheduled',
  "published_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "idempotency_key" TEXT,
  "processing_started_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scheduled_posts_pkey" PRIMARY KEY ("id")
);

-- Create post_history
CREATE TABLE "post_history" (
  "id" TEXT NOT NULL,
  "scheduled_post_id" TEXT NOT NULL,
  "event_type" "PostHistoryEventType" NOT NULL,
  "channel" TEXT,
  "message" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_history_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE UNIQUE INDEX "scheduled_posts_idempotency_key_key" ON "scheduled_posts"("idempotency_key");
CREATE INDEX "scheduled_posts_status_scheduled_at_idx" ON "scheduled_posts"("status", "scheduled_at");
CREATE INDEX "scheduled_posts_scheduled_at_idx" ON "scheduled_posts"("scheduled_at");
CREATE INDEX "post_history_scheduled_post_id_created_at_idx" ON "post_history"("scheduled_post_id", "created_at");

-- Create foreign key
ALTER TABLE "post_history"
ADD CONSTRAINT "post_history_scheduled_post_id_fkey"
FOREIGN KEY ("scheduled_post_id") REFERENCES "scheduled_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
