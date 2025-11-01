-- Migration number: 0001 	 2025-10-31T13:22:05.056Z
-- 0001_init.sql
PRAGMA foreign_keys = ON;
-- =========================
-- channels
-- =========================
CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    -- UUID
    name TEXT NOT NULL,
    -- チャンネル名
    artist_name TEXT,
    -- 芸人名
    category INTEGER,
    -- 1:コンビ 2:トリオ 3:ピン 4:その他
    search_count INTEGER NOT NULL DEFAULT 0,
    -- アプリ内での検索回数
    keyword TEXT,
    -- API検索用キーワード（コント,漫才,ネタ等）
    last_checked TEXT,
    -- ISO8601 UTC: 2020-11-27T10:00:04Z
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (
        category IN (1, 2, 3, 4)
        OR category IS NULL
    )
);
CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name);
CREATE INDEX IF NOT EXISTS idx_channels_last_checked ON channels(last_checked);
-- =========================
-- videos
-- =========================
CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    -- YouTube videoId
    title TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    published_at TEXT,
    -- ISO8601 UTC
    duration_sec INTEGER NOT NULL,
    -- 秒
    category INTEGER,
    -- 0:未分類 1:漫才 2:コント 3:ピン 4:その他
    is_included INTEGER NOT NULL DEFAULT 0,
    -- 1:ネタ動画 0:それ以外
    status INTEGER NOT NULL DEFAULT 0,
    -- 0:待ち 1:OK 2:NG 3:要判定(AI済)
    last_checked_at TEXT,
    -- ISO8601 UTC
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CHECK (is_included IN (0, 1)),
    CHECK (status IN (0, 1, 2, 3)),
    CHECK (
        category IN (0, 1, 2, 3, 4)
        OR category IS NULL
    )
);
CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_published_at ON videos(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_included_status ON videos(is_included, status);
-- =========================
-- playlists
-- =========================
CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    -- UUID
    channel_id TEXT NOT NULL,
    name TEXT NOT NULL,
    -- 再生リスト名
    is_included INTEGER NOT NULL DEFAULT 0,
    -- 1:ネタ動画 0:それ以外
    status INTEGER NOT NULL DEFAULT 0,
    -- 0:待ち 1:OK 2:NG 3:要判定(AI済)
    last_checked TEXT NOT NULL,
    -- ISO8601 UTC
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CHECK (is_included IN (0, 1)),
    CHECK (status IN (0, 1, 2, 3))
);
CREATE INDEX IF NOT EXISTS idx_playlists_channel ON playlists(channel_id);
CREATE INDEX IF NOT EXISTS idx_playlists_last_checked ON playlists(last_checked);
-- =========================
-- search_logs（最大500件キープ）
-- 仕様メモ:
--  - 元の定義は artist_id 外部キーだったが、現行スキーマに artists テーブルが無いので
--    実利用に合わせて channel_id に変更しています（必要なら artist_id に戻して artists を別途作成して）。
-- =========================
CREATE TABLE IF NOT EXISTS search_logs (
    id TEXT PRIMARY KEY,
    -- UUID
    keyword TEXT NOT NULL UNIQUE,
    -- 検索キーワード
    count INTEGER NOT NULL DEFAULT 1,
    -- 検索回数
    last_searched_at TEXT NOT NULL,
    -- ISO8601 UTC
    channel_id TEXT,
    -- 紐づけたい場合のみ
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON UPDATE CASCADE ON DELETE
    SET NULL
);
CREATE INDEX IF NOT EXISTS idx_search_logs_last ON search_logs(last_searched_at DESC);
-- 500件超過時に古いものを削除（last_searched_at の降順で最新500件を残す）
CREATE TRIGGER IF NOT EXISTS trg_search_logs_trim_after_insert
AFTER
INSERT ON search_logs BEGIN
DELETE FROM search_logs
WHERE id IN (
        SELECT id
        FROM search_logs
        ORDER BY last_searched_at DESC,
            created_at DESC
        LIMIT -1 OFFSET 500
    );
END;
-- 既存行の更新（キーワード再検索）でもトリム
CREATE TRIGGER IF NOT EXISTS trg_search_logs_trim_after_update
AFTER
UPDATE OF last_searched_at ON search_logs BEGIN
DELETE FROM search_logs
WHERE id IN (
        SELECT id
        FROM search_logs
        ORDER BY last_searched_at DESC,
            created_at DESC
        LIMIT -1 OFFSET 500
    );
END;
