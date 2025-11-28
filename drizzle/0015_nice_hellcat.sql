CREATE INDEX `idx_channels_status_id` ON `channels` (`status`,`id`);--> statement-breakpoint
CREATE INDEX `idx_channels_status_last_checked_created` ON `channels` (`status`,`last_checked_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_videos_status` ON `videos` (`status`);--> statement-breakpoint
CREATE INDEX `idx_videos_status_channel` ON `videos` (`status`,`channel_id`);