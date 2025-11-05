import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { channels } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

type BulkItem = {
  id?: unknown;
  channel_status?: unknown;
  channel_category?: unknown;
  artist_name?: unknown;
  keyword_id?: unknown;
};

type BulkRequestBody = {
  items?: BulkItem[];
};

type ChannelUpdate = Partial<typeof channels.$inferInsert>;

const MAX_ITEMS_PER_REQUEST = 100;
const KEYWORD_MAP: Record<number, string> = {
  1: "漫才",
  2: "コント",
  3: "ネタ",
};

export function registerPostAdminChannelBulk(app: Hono<AdminEnv>) {
  app.post("/admin/channel/bulk", async (c) => {
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
      const channelId = typeof item.id === "string" ? item.id.trim() : "";
      if (!channelId) {
        return fail(`${path}.id は必須です。`);
      }

      const update: ChannelUpdate = {};

      const channelStatusInput = normalizeInt(item.channel_status);
      if (channelStatusInput !== undefined && channelStatusInput !== 0 && channelStatusInput !== 1) {
        return fail(`${path}.channel_status には 0 または 1 を指定してください。`);
      }
      if (channelStatusInput !== undefined) {
        update.status = channelStatusInput;
      }

      const channelCategoryInput = normalizeInt(item.channel_category);
      if (channelCategoryInput !== undefined && (channelCategoryInput < 1 || channelCategoryInput > 4)) {
        return fail(`${path}.channel_category は 1〜4 の整数を指定してください。`);
      }
      if (channelCategoryInput !== undefined) {
        if (channelStatusInput !== 1) {
          return fail(`${path}.channel_category は channel_status が 1 の場合にのみ指定してください。`);
        }
        update.category = channelCategoryInput;
      }

      const keywordIdInput = normalizeInt(item.keyword_id);
      if (keywordIdInput !== undefined) {
        const mappedKeyword = KEYWORD_MAP[keywordIdInput];
        if (!mappedKeyword) {
          return fail(`${path}.keyword_id には 1〜3 の整数を指定してください。`);
        }
        update.keyword = mappedKeyword;
      }

      const artistNameInput =
        typeof item.artist_name === "string" && item.artist_name.trim() !== ""
          ? item.artist_name.trim()
          : undefined;
      if (artistNameInput !== undefined) {
        update.artistName = artistNameInput;
      }

      if (Object.keys(update).length === 0) {
        return fail(`${path} には反映可能な更新項目がありません。`);
      }

      const result = await db
        .update(channels)
        .set(update)
        .where(eq(channels.id, channelId))
        .returning({ id: channels.id });

      if (result.length === 0) {
        return fail(`${path}.id に該当するチャンネルが存在しません。`);
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
