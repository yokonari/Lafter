CREATE TABLE `agencies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_order` integer DEFAULT 999 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agencies_name` ON `agencies` (`name`);--> statement-breakpoint
CREATE INDEX `idx_agencies_display_order` ON `agencies` (`display_order`);--> statement-breakpoint
CREATE TABLE `agency_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agency_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_agency_channels_agency_id` ON `agency_channels` (`agency_id`);--> statement-breakpoint
CREATE INDEX `idx_agency_channels_channel_id` ON `agency_channels` (`channel_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_agency_channel` ON `agency_channels` (`agency_id`,`channel_id`);--> statement-breakpoint
CREATE TABLE `artist_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artist_id` integer NOT NULL,
	`channel_id` text NOT NULL,
	`role` text DEFAULT 'official' NOT NULL,
	`description` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_artist_channels_artist_id` ON `artist_channels` (`artist_id`);--> statement-breakpoint
CREATE INDEX `idx_artist_channels_channel_id` ON `artist_channels` (`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_artist_channels_role` ON `artist_channels` (`role`);--> statement-breakpoint
CREATE INDEX `idx_artist_channels_artist_role` ON `artist_channels` (`artist_id`,`role`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_artist_channel` ON `artist_channels` (`artist_id`,`channel_id`);--> statement-breakpoint
CREATE TABLE `artist_styles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artist_id` integer NOT NULL,
	`style_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`style_id`) REFERENCES `styles`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_artist_styles_artist_id` ON `artist_styles` (`artist_id`);--> statement-breakpoint
CREATE INDEX `idx_artist_styles_style_id` ON `artist_styles` (`style_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_artist_style` ON `artist_styles` (`artist_id`,`style_id`);--> statement-breakpoint
CREATE TABLE `artists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`kana` text,
	`started_on` text,
	`description` text,
	`agency_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artists_slug_unique` ON `artists` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_artists_slug` ON `artists` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_artists_name` ON `artists` (`name`);--> statement-breakpoint
CREATE INDEX `idx_artists_kana` ON `artists` (`kana`);--> statement-breakpoint
CREATE INDEX `idx_artists_agency_id` ON `artists` (`agency_id`);--> statement-breakpoint
CREATE INDEX `idx_artists_started_on` ON `artists` (`started_on`);--> statement-breakpoint
CREATE INDEX `idx_artists_agency_kana` ON `artists` (`agency_id`,`kana`);--> statement-breakpoint
CREATE TABLE `media_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` text NOT NULL,
	`name` text NOT NULL,
	`display_order` integer DEFAULT 999 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_channels_channel_id_unique` ON `media_channels` (`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_media_channels_channel_id` ON `media_channels` (`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_media_channels_display_order` ON `media_channels` (`display_order`);--> statement-breakpoint
CREATE TABLE `styles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_order` integer DEFAULT 999 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_styles_name` ON `styles` (`name`);--> statement-breakpoint
CREATE INDEX `idx_styles_display_order` ON `styles` (`display_order`);