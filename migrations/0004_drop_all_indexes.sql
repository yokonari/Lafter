-- Migration number: 0004 	 2025-10-31T14:20:36.289Z
-- 000x_drop_all_indexes.sql
-- 既存の“明示作成した”インデックスをすべて削除
DROP INDEX IF EXISTS idx_channels_name;
DROP INDEX IF EXISTS idx_channels_last_checked;
DROP INDEX IF EXISTS idx_channels_artist_kana;

DROP INDEX IF EXISTS idx_videos_channel;
DROP INDEX IF EXISTS idx_videos_published_at;
DROP INDEX IF EXISTS idx_videos_included_status;

DROP INDEX IF EXISTS idx_playlists_channel;
DROP INDEX IF EXISTS idx_playlists_last_checked;

DROP INDEX IF EXISTS idx_search_logs_last;
