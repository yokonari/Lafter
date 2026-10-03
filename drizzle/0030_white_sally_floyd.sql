DROP INDEX `idx_videos_status_view_count_published`;--> statement-breakpoint
DROP INDEX `idx_videos_status_like_count_published`;--> statement-breakpoint
CREATE INDEX `idx_videos_active_view_count_published` ON `videos` (`view_count`,`published_at`) WHERE "videos"."status" IN (1, 3) AND "videos"."view_count" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_videos_active_like_count_published` ON `videos` (`like_count`,`published_at`) WHERE "videos"."status" IN (1, 3) AND "videos"."like_count" IS NOT NULL;