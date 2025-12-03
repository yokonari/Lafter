import type { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { channels, videos } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

type YouTubeVideosResponse = {
  items?: Array<{
    id?: string | null;
  }>;
};

const MAX_BATCH_SIZE = 50;

export function registerPostVideosCheck(app: Hono<AdminEnv>) {
  // Cron ワーカーから直接呼べるよう /admin プレフィックス外に公開し、共有シークレットで丁寧に防御します。
  app.post("/videos/check", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const fail = (message: string, status: ContentfulStatusCode = 400) => c.json({ message }, status);

    const apiKey =
      env.YOUTUBE_API_KEY ??
      // ローカル開発でも丁寧に動作するよう process.env からのフォールバックも許容します。
      process.env.YOUTUBE_API_KEY ??
      "";

    if (!apiKey) {
      return fail("YOUTUBE_API_KEY が設定されていません。", 500);
    }

    // Cron からの定期実行に特化させるため、リクエストボディは受け付けず定数で動作させます。
    const limit = MAX_BATCH_SIZE;
    const deleteMissing = true;

    const orderByNullsFirst = sql`CASE WHEN ${videos.lastCheckedAt} IS NULL THEN 0 ELSE 1 END`;
    const targets = await db
      .select({
        id: videos.id,
      })
      .from(videos)
      // 公開済み(status=1)と一時的に調整が必要な動画(status=3)を丁寧に対象へ含め、利用者向け一覧の健全性を守ります。
      .where(inArray(videos.status, [1, 3]))
      .orderBy(orderByNullsFirst, asc(videos.lastCheckedAt), asc(videos.createdAt))
      .limit(limit);

    if (targets.length === 0) {
      return c.json({
        message: "チェック対象の動画が見つかりませんでした。",
        requestedStatus: 1,
        checked: 0,
        missing: 0,
        deleted: 0,
      });
    }

    const ids = targets.map((row) => row.id);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    // 取得する情報を最小限に抑え、クォータ消費を丁寧に節約します。
    url.searchParams.set("part", "status");
    url.searchParams.set("id", ids.join(","));
    url.searchParams.set("maxResults", String(Math.min(ids.length, MAX_BATCH_SIZE)));
    url.searchParams.set("key", apiKey);

    let response: Response;
    try {
      response = await fetch(url.toString());
    } catch (error) {
      console.error("[admin/videos/check] YouTube API の呼び出しに失敗しました。", error);
      return fail("YouTube API の呼び出しに失敗しました。", 502);
    }

    if (!response.ok) {
      console.error(
        "[admin/videos/check] YouTube API エラー",
        response.status,
        response.statusText,
      );
      return fail(`YouTube API の応答が不正です。(HTTP ${response.status})`, 502);
    }

    let data: YouTubeVideosResponse;
    try {
      data = (await response.json()) as YouTubeVideosResponse;
    } catch (error) {
      console.error("[admin/videos/check] YouTube API 応答のJSON化に失敗しました。", error);
      return fail("YouTube API の応答を JSON として解釈できませんでした。", 502);
    }

    const foundIds = new Set(
      (data.items ?? [])
        .map((item) => (typeof item.id === "string" ? item.id : null))
        .filter((id): id is string => Boolean(id)),
    );

    const missingIds = ids.filter((id) => !foundIds.has(id));
    const existingIds = ids.filter((id) => foundIds.has(id));

    const now = new Date().toISOString();
    if (existingIds.length > 0) {
      // 存在確認できた動画は lastCheckedAt を丁寧に更新し、次回チェックを後回しにします。
      await db.update(videos).set({ lastCheckedAt: now }).where(inArray(videos.id, existingIds));
    }

    let deletedCount = 0;
    if (missingIds.length > 0) {
      if (deleteMissing) {
        // YouTube 側で削除されている動画は status=2, reportStatus=3 に丁寧に更新し、管理者報告待ちとして安全に退避します。
        await db
          .update(videos)
          .set({ lastCheckedAt: now, status: 2, reportStatus: 3 })
          .where(inArray(videos.id, missingIds));
        deletedCount = missingIds.length;
      } else {
        await db.update(videos).set({ lastCheckedAt: now }).where(inArray(videos.id, missingIds));
      }
    }

    return c.json(
      {
        message: "動画の存在チェックが完了しました。",
        checked: ids.length,
        confirmed: existingIds.length,
        missing: missingIds.length,
        deleted: deletedCount,
        requestedStatus: 1,
        limit,
        deleteMissing,
        checkedIds: ids,
        missingIds,
      },
      200,
    );
  });
}
