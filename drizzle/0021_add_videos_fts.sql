-- FTS5 (Full-Text Search) テーブルを作成し、動画タイトルの高速検索を可能にします
-- content='videos' により、videos テーブルと連携します
-- tokenize='unicode61' は日本語を含む Unicode テキストを適切にトークン化します

CREATE VIRTUAL TABLE IF NOT EXISTS videos_fts USING fts5(
  title,
  content='videos',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
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
-- status が 1 または 3 に変更された場合は追加/更新、それ以外は削除
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
