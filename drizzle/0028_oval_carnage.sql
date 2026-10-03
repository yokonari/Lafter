ALTER TABLE `videos` ADD `random_key` real;--> statement-breakpoint
-- 既存動画にも0以上1未満の固定乱数を割り当て、移行直後からインデックス抽出を利用します。
UPDATE `videos`
SET `random_key` = (random() + 9223372036854775808.0) / 18446744073709551616.0
WHERE `random_key` IS NULL;--> statement-breakpoint
CREATE INDEX `idx_videos_active_random_key` ON `videos` (`random_key`) WHERE "videos"."status" IN (1, 3);
