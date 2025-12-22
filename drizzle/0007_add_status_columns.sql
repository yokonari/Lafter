-- playlists テーブルへ status 列を丁寧に追加し直します。
ALTER TABLE "playlists" ADD COLUMN "status" integer NOT NULL DEFAULT 0;
