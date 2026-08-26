CREATE TABLE `video_classification_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`video_id` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`predicted_label` integer NOT NULL,
	`raw_response` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_video_classification_results_video_created` ON `video_classification_results` (`video_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_video_classification_results_model` ON `video_classification_results` (`model`);--> statement-breakpoint
CREATE TABLE `video_manual_labels` (
	`video_id` text PRIMARY KEY NOT NULL,
	`label` integer NOT NULL,
	`source` text DEFAULT 'admin' NOT NULL,
	`reviewed_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_video_manual_labels_label` ON `video_manual_labels` (`label`);