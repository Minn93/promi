/*
  Warnings:

  - Made the column `owner_id` on table `post_history` required. This step will fail if there are existing NULL values in that column.
  - Made the column `owner_id` on table `publish_attempts` required. This step will fail if there are existing NULL values in that column.
  - Made the column `owner_id` on table `scheduled_posts` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "post_history" ALTER COLUMN "owner_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "publish_attempts" ALTER COLUMN "owner_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "scheduled_posts" ALTER COLUMN "owner_id" SET NOT NULL;
