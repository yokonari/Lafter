-- FTS5 を使わない方針になったため、不要な videos_fts テーブルとトリガーを削除します

-- トリガーを削除
DROP TRIGGER IF EXISTS videos_fts_insert;-->statement-breakpoint
DROP TRIGGER IF EXISTS videos_fts_update;-->statement-breakpoint
DROP TRIGGER IF EXISTS videos_fts_delete;-->statement-breakpoint

-- FTS5 仮想テーブルを削除
DROP TABLE IF EXISTS videos_fts;
