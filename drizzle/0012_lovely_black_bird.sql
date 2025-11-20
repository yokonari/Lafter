PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_search_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`keyword` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_search_logs`("id", "keyword", "created_at") SELECT "id", "keyword", "created_at" FROM `search_logs`;--> statement-breakpoint
DROP TABLE `search_logs`;--> statement-breakpoint
ALTER TABLE `__new_search_logs` RENAME TO `search_logs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `channels` ADD `last_checked_at` text;--> statement-breakpoint
ALTER TABLE `channels` DROP COLUMN `search_count`;--> statement-breakpoint
ALTER TABLE `channels` DROP COLUMN `last_checked`;--> statement-breakpoint
ALTER TABLE `playlists` ADD `last_checked_at` text;--> statement-breakpoint
ALTER TABLE `playlists` DROP COLUMN `last_checked`;