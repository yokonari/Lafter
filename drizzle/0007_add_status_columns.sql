-- playlists テーブルに存在する status 列を丁寧に削除し、再作成いたします。
ALTER TABLE "playlists" DROP COLUMN "status";

-- playlists テーブルへ status 列を丁寧に追加し直します。
ALTER TABLE "playlists" ADD COLUMN "status" integer NOT NULL DEFAULT 0;
