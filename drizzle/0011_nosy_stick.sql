CREATE INDEX `idx_channels_status` ON `channels` (`status`);--> statement-breakpoint
CREATE INDEX `idx_videos_status_created_at` ON `videos` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_videos_channel_status` ON `videos` (`channel_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_videos_status_published_at` ON `videos` (`status`,`published_at`);