import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { channels } from "@/lib/schema";
import { rebuildActiveChannelsCache } from "@/lib/active-channels-cache";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

type BulkItem = {
  id?: unknown;
  channel_status?: unknown;
};

type BulkRequestBody = {
  items?: BulkItem[];
};

type ChannelUpdate = Partial<typeof channels.$inferInsert>;

const MAX_ITEMS_PER_REQUEST = 100;
export function registerPostAdminChannelBulk(app: Hono<AdminEnv>) {
  app.post("/admin/channel/bulk", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);
    let requiresCacheRefresh = false;

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
      if (channelStatusInput !== undefined && ![0, 1, 2].includes(channelStatusInput)) {
        return fail(`${path}.channel_status には 0〜2 の整数を指定してください。`);
      }
      if (channelStatusInput !== undefined) {
        update.status = channelStatusInput;
        // ステータス変更が発生した場合は、後段でキャッシュ更新を行うため印を付けておきます。
        requiresCacheRefresh = true;
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

    if (requiresCacheRefresh) {
      const kv = env.LAFTER;
      if (!kv) {
        return c.json(
          { message: "Workers KV LAFTER バインディングが設定されていません。" },
          500,
        );
      }
      try {
        // 管理画面からステータス変更があった場合は、最新/ランダム動画キャッシュを丁寧に削除して再生成を促します。
        await Promise.all([
          kv.delete("latest_active_videos"),
          kv.delete("random_active_videos"),
          rebuildActiveChannelsCache(env.DB, kv),
        ]);
      } catch (error) {
        console.error("Workers KV のキャッシュ削除に失敗しました。", error);
        return c.json({ message: "キャッシュの削除に失敗しました。" }, 500);
      }
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
