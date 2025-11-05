-- playlists テーブルへ status 列を丁寧に追加します。
ALTER TABLE "playlists" ADD COLUMN "status" integer NOT NULL DEFAULT 0;
