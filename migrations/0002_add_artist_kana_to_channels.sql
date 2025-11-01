-- Migration number: 0002 	 2025-10-31T14:04:51.282Z
-- 0002_add_artist_kana_to_channels.sql
ALTER TABLE channels
ADD COLUMN artist_kana TEXT;
-- かな/カナ読み（NULL可）
-- 検索・並び替え用のインデックス（任意）
CREATE INDEX IF NOT EXISTS idx_channels_artist_kana ON channels(artist_kana);
