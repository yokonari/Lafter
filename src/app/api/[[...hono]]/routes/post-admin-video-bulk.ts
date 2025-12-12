import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { videos } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

type BulkItem = {
  id?: unknown;
  video_status?: unknown;
};

type BulkRequestBody = {
  items?: BulkItem[];
};

type VideoInsert = typeof videos.$inferInsert;

// few-shot キャッシュのキープレフィックス。classify/route.ts と同期を保つ必要があります。
const CHANNEL_FEW_SHOT_KV_PREFIX = "llm:few-shots:";

export function registerPostAdminVideoBulk(app: Hono<AdminEnv>) {
  app.post("/admin/video/bulk", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const fail = (message: string, status: ContentfulStatusCode = 400) =>
      c.json({ message }, status);

    let body: BulkRequestBody;
    try {
      body = (await c.req.json()) as BulkRequestBody;
    } catch {
      return fail("リクエスト本文を JSON として解釈できませんでした。");
    }

    // ご指定いただいた配列をそのまま丁寧にお預かりし、100件超でも漏れなく処理いたします。
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return fail("更新対象の items が指定されていません。");
    }

    let processed = 0;
    // ステータスを 1 または 2 に変更する際に、few-shot キャッシュ更新が必要なチャンネルIDを収集します。
    const channelsNeedingFewShotRefresh = new Set<string>();

    for (const [index, item] of items.entries()) {
      const path = `items[${index}]`;
      const videoId = typeof item.id === "string" ? item.id.trim() : "";
      if (!videoId) {
        return fail(`${path}.id は必須です。`);
      }

      const [videoRow] = await db
        .select({
          id: videos.id,
          status: videos.status,
          channelId: videos.channelId,
        })
        .from(videos)
        .where(eq(videos.id, videoId))
        .limit(1);

      if (!videoRow) {
        return fail(`${path}.id に該当する動画が存在しません。`);
      }

      const videoUpdates: Partial<VideoInsert> = {};

      const videoStatus = normalizeInt(item.video_status);
      if (videoStatus === undefined || ![0, 1, 2, 3, 4].includes(videoStatus)) {
        return fail(`${path}.video_status には 0〜4 の整数を指定してください。`);
      }
      videoUpdates.status = videoStatus;

      // ステータスを 1 または 2 に変更する場合、few-shot 更新対象としてチャンネルを記録します。
      if ((videoStatus === 1 || videoStatus === 2) && videoRow.channelId) {
        channelsNeedingFewShotRefresh.add(videoRow.channelId);
      }

      if (Object.keys(videoUpdates).length > 0) {
        await db.update(videos).set(videoUpdates).where(eq(videos.id, videoId));
      }

      processed += 1;
    }

    // ステータスを 1 または 2 に変更したチャンネルの few-shot キャッシュを KV から削除し、次回 classify 時に再構築させます。
    if (channelsNeedingFewShotRefresh.size > 0 && env.LAFTER) {
      for (const channelId of channelsNeedingFewShotRefresh) {
        const key = `${CHANNEL_FEW_SHOT_KV_PREFIX}${channelId}`;
        try {
          await env.LAFTER.delete(key);
          console.log(`[admin/video/bulk] few-shot キャッシュを削除しました: ${key}`);
        } catch (error) {
          console.error(`[admin/video/bulk] few-shot キャッシュ削除に失敗: ${key}`, error);
        }
      }
    }

    // まとめて更新した件数を丁寧にお知らせいたします。
    return c.json({
      success: true,
      processed,
      fewShotRefreshedChannels: Array.from(channelsNeedingFewShotRefresh),
    }, 200);
  });
}

function normalizeInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return undefined;
}
