-- 0003_reorder_channels_artist_columns.sql
-- 外部キー一時オフ（DROP時の衝突回避）
PRAGMA foreign_keys = OFF;
-- 新しい列順で作り直す（artist_name の次に artist_kana）
CREATE TABLE channels_new (
    id TEXT PRIMARY KEY,
    -- UUID
    name TEXT NOT NULL,
    -- チャンネル名
    artist_name TEXT,
    -- 芸人名
    artist_kana TEXT,
    -- 芸名かな
    category INTEGER,
    -- 1:コンビ 2:トリオ 3:ピン 4:その他
    search_count INTEGER NOT NULL DEFAULT 0,
    -- 検索回数
    keyword TEXT,
    -- API検索用キーワード
    last_checked TEXT,
    -- ISO8601 UTC
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (
        category IN (1, 2, 3, 4)
        OR category IS NULL
    )
);
-- 既存データをコピー（列名で明示指定）
INSERT INTO channels_new (
        id,
        name,
        artist_name,
        artist_kana,
        category,
        search_count,
        keyword,
        last_checked,
        created_at
    )
SELECT id,
    name,
    artist_name,
    artist_kana,
    category,
    COALESCE(search_count, 0),
    keyword,
    last_checked,
    created_at
FROM channels;
-- 旧テーブルと差し替え
DROP TABLE channels;
ALTER TABLE channels_new
    RENAME TO channels;
-- 失われるインデックスを再作成
CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name);
CREATE INDEX IF NOT EXISTS idx_channels_last_checked ON channels(last_checked);
CREATE INDEX IF NOT EXISTS idx_channels_artist_kana ON channels(artist_kana);
-- 外部キーを戻す
PRAGMA foreign_keys = ON;
