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
  video_category?: unknown;
};

type BulkRequestBody = {
  items?: BulkItem[];
};

type VideoInsert = typeof videos.$inferInsert;
const MAX_ITEMS_PER_REQUEST = 100;

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

    const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS_PER_REQUEST) : [];
    if (items.length === 0) {
      return fail("更新対象の items が指定されていません。");
    }

    let processed = 0;
    for (const [index, item] of items.entries()) {
      const path = `items[${index}]`;
      const videoId = typeof item.id === "string" ? item.id.trim() : "";
      if (!videoId) {
        return fail(`${path}.id は必須です。`);
      }

      const [videoRow] = await db
        .select({
          id: videos.id,
        })
        .from(videos)
        .where(eq(videos.id, videoId))
        .limit(1);

      if (!videoRow) {
        return fail(`${path}.id に該当する動画が存在しません。`);
      }

      const videoUpdates: Partial<VideoInsert> = {};

      const videoStatus = normalizeInt(item.video_status);
      if (videoStatus === undefined || ![0, 1, 2].includes(videoStatus)) {
        return fail(`${path}.video_status には 0〜2 の整数を指定してください。`);
      }
      videoUpdates.status = videoStatus;

      const videoCategoryInput = normalizeInt(item.video_category);
      if (videoStatus === 1) {
        if (videoCategoryInput === undefined) {
          return fail(`${path}.video_category は ステータスが1の場合に必須です。1〜4 の整数を指定してください。`);
        }
        if (videoCategoryInput < 1 || videoCategoryInput > 4) {
          return fail(`${path}.video_category は ステータスが1の場合、1〜4 の整数を指定してください（0は不可）。`);
        }
        videoUpdates.category = videoCategoryInput;
      } else if (item.video_category !== undefined) {
        if (videoCategoryInput === undefined || videoCategoryInput < 0 || videoCategoryInput > 4) {
          return fail(`${path}.video_category は 0〜4 の整数を指定してください。`);
        }
        videoUpdates.category = videoCategoryInput;
      }

      if (Object.keys(videoUpdates).length > 0) {
        await db.update(videos).set(videoUpdates).where(eq(videos.id, videoId));
      }

      processed += 1;
    }

    // まとめて更新した件数を丁寧にお知らせいたします。
    return c.json({ success: true, processed }, 200);
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
