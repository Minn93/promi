-- AlterTable
ALTER TABLE "post_history" ADD COLUMN     "owner_id" TEXT;

-- AlterTable
ALTER TABLE "publish_attempts" ADD COLUMN     "owner_id" TEXT;

-- AlterTable
ALTER TABLE "scheduled_posts" ADD COLUMN     "owner_id" TEXT;

-- CreateIndex
CREATE INDEX "post_history_owner_created_at_idx" ON "post_history"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "post_history_owner_scheduled_post_id_created_at_idx" ON "post_history"("owner_id", "scheduled_post_id", "created_at");

-- CreateIndex
CREATE INDEX "publish_attempts_owner_created_at_idx" ON "publish_attempts"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "publish_attempts_owner_scheduled_post_id_created_at_idx" ON "publish_attempts"("owner_id", "scheduled_post_id", "created_at");

-- CreateIndex
CREATE INDEX "scheduled_posts_owner_status_scheduled_at_idx" ON "scheduled_posts"("owner_id", "status", "scheduled_at");

-- CreateIndex
CREATE INDEX "scheduled_posts_owner_created_at_idx" ON "scheduled_posts"("owner_id", "created_at");
