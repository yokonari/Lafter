DROP INDEX `idx_videos_status_last_checked_created`;--> statement-breakpoint
CREATE INDEX `idx_videos_status_last_checked_published` ON `videos` (`status`,`last_checked_at`,`published_at`);