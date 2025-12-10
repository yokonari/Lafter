-- FTS5 を trigram トークナイザーに変更し、日本語の部分一致検索を可能にします
-- trigram は 3 文字の重複トークンを生成するため、日本語でも LIKE '%keyword%' 相当の検索が高速に動作します

-- 既存のトリガーを削除
DROP TRIGGER IF EXISTS videos_fts_insert;-->statement-breakpoint
DROP TRIGGER IF EXISTS videos_fts_update;-->statement-breakpoint
DROP TRIGGER IF EXISTS videos_fts_delete;-->statement-breakpoint

-- 既存の FTS テーブルを削除
DROP TABLE IF EXISTS videos_fts;-->statement-breakpoint

-- trigram トークナイザーで FTS5 テーブルを再作成
CREATE VIRTUAL TABLE IF NOT EXISTS videos_fts USING fts5(
  title,
  content='videos',
  content_rowid='rowid',
  tokenize='trigram'
);-->statement-breakpoint

-- 既存の videos テーブルからデータを FTS インデックスに投入します
INSERT INTO videos_fts(rowid, title)
SELECT rowid, title FROM videos WHERE status IN (1, 3);-->statement-breakpoint

-- videos テーブルへの INSERT 時に FTS インデックスを自動更新するトリガー
CREATE TRIGGER IF NOT EXISTS videos_fts_insert AFTER INSERT ON videos
WHEN NEW.status IN (1, 3)
BEGIN
  INSERT INTO videos_fts(rowid, title) VALUES (NEW.rowid, NEW.title);
END;-->statement-breakpoint

-- videos テーブルの UPDATE 時に FTS インデックスを同期するトリガー
CREATE TRIGGER IF NOT EXISTS videos_fts_update AFTER UPDATE ON videos
BEGIN
  DELETE FROM videos_fts WHERE rowid = OLD.rowid;
  INSERT INTO videos_fts(rowid, title)
  SELECT NEW.rowid, NEW.title WHERE NEW.status IN (1, 3);
END;-->statement-breakpoint

-- videos テーブルからの DELETE 時に FTS インデックスからも削除するトリガー
CREATE TRIGGER IF NOT EXISTS videos_fts_delete AFTER DELETE ON videos
BEGIN
  DELETE FROM videos_fts WHERE rowid = OLD.rowid;
END;
