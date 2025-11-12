ALTER TABLE `playlists` ADD `top_video_id` text;--> statement-breakpoint
ALTER TABLE `channels` DROP COLUMN `artist_name`;--> statement-breakpoint
ALTER TABLE `channels` DROP COLUMN `category`;