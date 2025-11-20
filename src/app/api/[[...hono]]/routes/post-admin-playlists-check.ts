import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq, inArray } from "drizzle-orm";
import { playlists } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

type YouTubePlaylistResponse = {
    items?: {
        id: string;
        snippet: {
            title: string;
            thumbnails?: {
                default?: { url: string };
                medium?: { url: string };
                high?: { url: string };
                standard?: { url: string };
                maxres?: { url: string };
            };
        };
    }[];
};

function extractVideoIdFromThumbnail(url: string): string | null {
    const match = url.match(/\/vi\/([^\/]+)\//);
    return match ? match[1] : null;
}

export function registerPostAdminPlaylistsCheck(app: Hono<AdminEnv>) {
    app.post("/admin/playlists/check", async (c) => {
        const { env } = getCloudflareContext();
        const db = createDatabase(env);
        const apiKey =
            env.YOUTUBE_API_KEY ??
            // ローカル開発時は process.env から丁寧に補完し、共有の環境変数設定を維持いたします。
            process.env.YOUTUBE_API_KEY ??
            "";

        if (!apiKey) {
            return c.json({ message: "YOUTUBE_API_KEY が設定されていません。" }, 500);
        }

        // status=1 のプレイリストを取得
        const targetPlaylists = await db
            .select({
                id: playlists.id,
                name: playlists.name,
                topVideoId: playlists.topVideoId,
            })
            .from(playlists)
            .where(eq(playlists.status, 1));

        if (targetPlaylists.length === 0) {
            return c.json({ message: "チェック対象のプレイリストがありません。", count: 0 }, 200);
        }

        // YouTube API の制限を考慮し、50件ずつバッチ処理
        const batchSize = 50;
        let checkedCount = 0;
        let deletedCount = 0;
        let updatedCount = 0;

        for (let i = 0; i < targetPlaylists.length; i += batchSize) {
            const batch = targetPlaylists.slice(i, i + batchSize);
            const ids = batch.map((p) => p.id).join(",");

            // part=snippet を追加してタイトルとサムネイルを取得
            const url = `https://www.googleapis.com/youtube/v3/playlists?part=id,snippet&id=${ids}&key=${apiKey}`;

            try {
                const response = await fetch(url);
                if (!response.ok) {
                    console.error(`YouTube API Error: ${response.status} ${response.statusText}`);
                    continue;
                }

                const data = (await response.json()) as YouTubePlaylistResponse;
                const items = data.items || [];
                const foundIds = new Set(items.map((item) => item.id));

                // 存在しない（レスポンスに含まれない）IDを特定
                const missingIds = batch
                    .map((p) => p.id)
                    .filter((id) => !foundIds.has(id));

                if (missingIds.length > 0) {
                    // 存在しないプレイリストを削除
                    await db.delete(playlists).where(inArray(playlists.id, missingIds));
                    deletedCount += missingIds.length;
                }

                // 存在するプレイリストの更新チェック
                for (const item of items) {
                    const currentPlaylist = batch.find((p) => p.id === item.id);
                    if (!currentPlaylist) continue;

                    const newTitle = item.snippet.title;
                    let newTopVideoId = currentPlaylist.topVideoId;

                    // サムネイルから動画IDを抽出
                    const thumbnails = item.snippet.thumbnails;
                    if (thumbnails) {
                        // 解像度の高い順にチェック（どれでもIDは同じはずだが念のため）
                        const thumbUrl =
                            thumbnails.maxres?.url ||
                            thumbnails.standard?.url ||
                            thumbnails.high?.url ||
                            thumbnails.medium?.url ||
                            thumbnails.default?.url;

                        if (thumbUrl) {
                            const extractedId = extractVideoIdFromThumbnail(thumbUrl);
                            if (extractedId) {
                                newTopVideoId = extractedId;
                            }
                        }
                    }

                    const needsUpdate =
                        newTitle !== currentPlaylist.name ||
                        newTopVideoId !== currentPlaylist.topVideoId;

                    if (needsUpdate) {
                        await db
                            .update(playlists)
                            .set({
                                name: newTitle,
                                topVideoId: newTopVideoId,
                                // 定期チェック時刻を新しいカラムへ丁寧に記録します。
                                lastCheckedAt: new Date().toISOString(),
                            })
                            .where(eq(playlists.id, item.id));
                        updatedCount++;
                    } else {
                        // 変更がない場合も lastCheckedAt だけ更新
                        await db
                            .update(playlists)
                            .set({ lastCheckedAt: new Date().toISOString() })
                            .where(eq(playlists.id, item.id));
                    }
                }

                checkedCount += batch.length;
            } catch (error) {
                console.error("Fetch error:", error);
            }
        }

        return c.json(
            {
                message: "プレイリストの存在確認と更新が完了しました。",
                total: targetPlaylists.length,
                checked: checkedCount,
                deleted: deletedCount,
                updated: updatedCount,
            },
            200,
        );
    });
}
