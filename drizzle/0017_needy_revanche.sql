DROP INDEX `idx_videos_status_created_at`;--> statement-breakpoint
DROP INDEX `idx_videos_channel_status`;--> statement-breakpoint
DROP INDEX `idx_videos_status_published_at`;--> statement-breakpoint
DROP INDEX `idx_videos_status`;--> statement-breakpoint
CREATE INDEX `idx_videos_status_published` ON `videos` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `idx_videos_channel_status_published` ON `videos` (`channel_id`,`status`,`published_at`);