import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { channels, videos } from "@/lib/schema";
import { createDatabase } from "../context";

type BulkItem = {
  id?: unknown;
  video_status?: unknown;
  video_category?: unknown;
  channel_status?: unknown;
  channel_category?: unknown;
};

type BulkRequestBody = {
  items?: BulkItem[];
};

type VideoInsert = typeof videos.$inferInsert;
type ChannelInsert = typeof channels.$inferInsert;

const MAX_ITEMS_PER_REQUEST = 100;

export function registerPostAdminVideoBulk(app: Hono) {
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
          channelId: videos.channelId,
          channelStatus: channels.status,
        })
        .from(videos)
        .leftJoin(channels, eq(videos.channelId, channels.id))
        .where(eq(videos.id, videoId))
        .limit(1);

      if (!videoRow) {
        return fail(`${path}.id に該当する動画が存在しません。`);
      }

      const channelId = videoRow.channelId;
      if (!channelId) {
        return fail(`${path}.id に紐づくチャンネルが見つかりません。`);
      }

      const videoUpdates: Partial<VideoInsert> = {};
      const channelUpdates: Partial<ChannelInsert> = {};

      const videoStatus = normalizeInt(item.video_status);
      if (videoStatus === undefined || (videoStatus !== 0 && videoStatus !== 1)) {
        return fail(`${path}.video_status には 0 または 1 を指定してください。`);
      }
      videoUpdates.status = videoStatus;

      let videoCategory: number | undefined;
      if (videoStatus === 1) {
        videoCategory = normalizeInt(item.video_category);
        if (videoCategory === undefined || videoCategory < 1 || videoCategory > 4) {
          return fail(`${path}.video_category は 1〜4 の整数で必須です。`);
        }
      } else if (item.video_category !== undefined) {
        const optionalCategory = normalizeInt(item.video_category);
        if (optionalCategory === undefined || optionalCategory < 1 || optionalCategory > 4) {
          return fail(`${path}.video_category は 1〜4 の整数を指定してください。`);
        }
        videoCategory = optionalCategory;
      }
      if (videoCategory !== undefined) {
        videoUpdates.category = videoCategory;
      }

      const existingChannelStatus = videoRow.channelStatus === 1 ? 1 : 0;
      const channelStatusInput = normalizeInt(item.channel_status);
      if (channelStatusInput !== undefined && channelStatusInput !== 0 && channelStatusInput !== 1) {
        return fail(`${path}.channel_status には 0 または 1 を指定してください。`);
      }

      if (videoStatus === 1 && existingChannelStatus === 0 && channelStatusInput === undefined) {
        return fail(
          `${path}.channel_status は video_status が 1 かつ既存チャンネルが未登録の場合に必須です。`,
        );
      }

      const channelCategoryInput = normalizeInt(item.channel_category);
      if (
        channelCategoryInput !== undefined &&
        (channelCategoryInput < 1 || channelCategoryInput > 4)
      ) {
        return fail(`${path}.channel_category は 1〜4 の整数を指定してください。`);
      }

      const effectiveChannelStatus = channelStatusInput ?? existingChannelStatus;
      if (channelStatusInput === 1 && channelCategoryInput === undefined) {
        return fail(`${path}.channel_category は channel_status が 1 のとき必須です。`);
      }
      if (channelCategoryInput !== undefined && effectiveChannelStatus !== 1) {
        return fail(`${path}.channel_category は channel_status が 1 の場合にのみ指定してください。`);
      }

      if (channelStatusInput !== undefined) {
        channelUpdates.status = channelStatusInput;
      }
      if (channelCategoryInput !== undefined) {
        channelUpdates.category = channelCategoryInput;
      }

      if (Object.keys(videoUpdates).length > 0) {
        await db.update(videos).set(videoUpdates).where(eq(videos.id, videoId));
      }

      if (Object.keys(channelUpdates).length > 0) {
        await db.update(channels).set(channelUpdates).where(eq(channels.id, channelId));
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
