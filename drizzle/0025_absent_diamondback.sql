CREATE TABLE `artist_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artist_id` integer NOT NULL,
	`name` text NOT NULL,
	`kana` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_artist_aliases_name` ON `artist_aliases` (`name`);--> statement-breakpoint
CREATE INDEX `idx_artist_aliases_kana` ON `artist_aliases` (`kana`);--> statement-breakpoint
CREATE INDEX `idx_artist_aliases_artist_id` ON `artist_aliases` (`artist_id`);--> statement-breakpoint
CREATE INDEX `idx_artist_aliases_artist_name` ON `artist_aliases` (`artist_id`,`name`);