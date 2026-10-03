-- 過去の削除マイグレーション後も検索用FTSを確実に利用できるよう再構築します。
DROP TRIGGER IF EXISTS videos_fts_insert;-->statement-breakpoint
DROP TRIGGER IF EXISTS videos_fts_update;-->statement-breakpoint
DROP TRIGGER IF EXISTS videos_fts_delete;-->statement-breakpoint
DROP TABLE IF EXISTS videos_fts;-->statement-breakpoint

CREATE VIRTUAL TABLE videos_fts USING fts5(
  title,
  content='videos',
  content_rowid='rowid',
  tokenize='trigram'
);-->statement-breakpoint

INSERT INTO videos_fts(rowid, title)
SELECT rowid, title FROM videos WHERE status IN (1, 3);-->statement-breakpoint

-- 公開対象の新規動画だけを検索インデックスへ追加します。
CREATE TRIGGER videos_fts_insert AFTER INSERT ON videos
WHEN NEW.status IN (1, 3)
BEGIN
  INSERT INTO videos_fts(rowid, title) VALUES (NEW.rowid, NEW.title);
END;-->statement-breakpoint

-- タイトルか公開状態が実際に変わった場合だけFTSを更新します。
CREATE TRIGGER videos_fts_update AFTER UPDATE OF title, status ON videos
WHEN OLD.title IS NOT NEW.title OR OLD.status IS NOT NEW.status
BEGIN
  INSERT INTO videos_fts(videos_fts, rowid, title)
  SELECT 'delete', OLD.rowid, OLD.title WHERE OLD.status IN (1, 3);
  INSERT INTO videos_fts(rowid, title)
  SELECT NEW.rowid, NEW.title WHERE NEW.status IN (1, 3);
END;-->statement-breakpoint

CREATE TRIGGER videos_fts_delete AFTER DELETE ON videos
WHEN OLD.status IN (1, 3)
BEGIN
  INSERT INTO videos_fts(videos_fts, rowid, title)
  VALUES ('delete', OLD.rowid, OLD.title);
END;
