ALTER TABLE "scheduled_posts"
ADD COLUMN "error_message" TEXT,
ADD COLUMN "processed_at" TIMESTAMPTZ(6),
ADD COLUMN "last_attempt_at" TIMESTAMPTZ(6),
ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0;
