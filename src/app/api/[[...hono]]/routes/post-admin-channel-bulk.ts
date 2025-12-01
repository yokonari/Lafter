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
    let requiresActiveChannelRefresh = false;

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
        if (channelStatusInput === 1) {
          // ステータスを 1 (アクティブ) に変更する場合は、後段で KV を最新化する必要があるため印を付けておきます。
          requiresActiveChannelRefresh = true;
        }
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

    if (requiresActiveChannelRefresh) {
      const kv = env.LAFTER;
      if (!kv) {
        return c.json(
          { message: "Workers KV LAFTER バインディングが設定されていません。" },
          500,
        );
      }
      const activeChannels = await db
        .select({
          channel_id: channels.id,
          channel_name: channels.name,
        })
        .from(channels)
        .where(eq(channels.status, 1));
      try {
        // ステータス 1 のチャンネル一覧を丁寧に KV へ反映し、GET API と同じ内容を即時共有いたします。
        await kv.put("active_channels", JSON.stringify(activeChannels));
      } catch (error) {
        console.error("Workers KV への active_channels 保存に失敗しました。", error);
        return c.json(
          { message: "Workers KV へアクティブチャンネル情報を書き込めませんでした。" },
          500,
        );
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
