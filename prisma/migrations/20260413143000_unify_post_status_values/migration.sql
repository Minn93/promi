-- Add shared status value for completeness.
ALTER TYPE "ScheduledPostStatus" ADD VALUE IF NOT EXISTS 'draft';

-- Rename legacy status/event value to the shared internal value.
ALTER TYPE "ScheduledPostStatus" RENAME VALUE 'posted' TO 'published';
ALTER TYPE "PostHistoryEventType" RENAME VALUE 'posted' TO 'published';
