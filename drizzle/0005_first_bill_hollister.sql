PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`password_hash` text,
	`created_at` integer DEFAULT (cast(unixepoch('now') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('now') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "name", "email_verified", "image", "password_hash", "created_at", "updated_at") SELECT "id", "email", "name", "email_verified", "image", "password_hash", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);