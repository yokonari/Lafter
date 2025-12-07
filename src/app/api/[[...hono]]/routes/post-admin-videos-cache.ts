import type { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { KVNamespace } from "@cloudflare/workers-types";
import { channels, videos } from "@/lib/schema";
import { createDatabase, type AppDatabase } from "../context";
import type { AdminEnv } from "../types";

type LatestVideoCacheItem = {
  channel_id: string;
  channel_name: string;
  video_id: string;
  video_title: string;
};

type LatestVideoCachePayload = {
  updated_at: string;
  items: LatestVideoCacheItem[];
};

const CACHE_KEY = "latest_active_videos";
const CACHE_LIMIT = 500;

export function registerPostAdminVideosCache(app: Hono<AdminEnv>) {
  app.post("/admin/videos/cache/latest", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);
    const kv = env.LAFTER;

    const fail = (message: string, status: ContentfulStatusCode = 400) => c.json({ message }, status);

    if (!kv) {
      return fail("Workers KV LAFTER バインディングが設定されていません。", 500);
    }

    let items: LatestVideoCacheItem[] = [];
    try {
      items = await fetchLatestVideosForCache(db, CACHE_LIMIT);
    } catch (error) {
      console.error("[admin/videos/cache/latest] 最新動画の取得に失敗しました。", error);
      return fail("最新動画の抽出に失敗しました。", 500);
    }

    const payload: LatestVideoCachePayload = {
      updated_at: new Date().toISOString(),
      items,
    };

    try {
      await saveLatestCache(kv, payload);
    } catch (error) {
      console.error("[admin/videos/cache/latest] 最新動画キャッシュの保存に失敗しました。", error);
      return fail("最新動画キャッシュの保存に失敗しました。", 500);
    }

    return c.json(
      {
        message: "最新動画キャッシュを再生成しました。",
        updated: items.length,
        cacheKey: CACHE_KEY,
      },
      200,
    );
  });
}

async function fetchLatestVideosForCache(db: AppDatabase, limit: number): Promise<LatestVideoCacheItem[]> {
  const rows = await db
    .select({
      channelId: videos.channelId,
      channelName: channels.name,
      videoId: videos.id,
      videoTitle: videos.title,
    })
    .from(videos)
    .innerJoin(channels, eq(videos.channelId, channels.id))
    .where(and(inArray(videos.status, [1, 3]), eq(channels.status, 1)))
    .orderBy(desc(videos.publishedAt))
    .limit(limit);

  // KV 保存時に欠損を混入させないよう型を整え、null を丁寧に排除します。
  return rows
    .filter(
      (row) =>
        typeof row.channelId === "string" &&
        row.channelId !== "" &&
        typeof row.videoId === "string" &&
        row.videoId !== "" &&
        typeof row.videoTitle === "string" &&
        row.videoTitle !== "",
    )
    .map((row) => ({
      channel_id: row.channelId,
      channel_name: row.channelName ?? row.channelId,
      video_id: row.videoId,
      video_title: row.videoTitle,
    }));
}

async function saveLatestCache(kv: KVNamespace, payload: LatestVideoCachePayload): Promise<void> {
  // Cron Worker と同じ JSON レイアウトで保存し、読み出しコードを共通化します。
  await kv.put(CACHE_KEY, JSON.stringify(payload));
}
