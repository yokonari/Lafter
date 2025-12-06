CREATE TABLE `aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`keyword` text NOT NULL,
	`channel_id` text NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_aliases_keyword` ON `aliases` (`keyword`);--> statement-breakpoint
CREATE INDEX `idx_aliases_channel_keyword` ON `aliases` (`channel_id`,`keyword`);