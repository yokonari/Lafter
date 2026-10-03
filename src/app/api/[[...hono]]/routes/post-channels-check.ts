import type { Hono, Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asc, eq, inArray } from "drizzle-orm";
import type { KVNamespace } from "@cloudflare/workers-types";
import { channels } from "@/lib/schema";
import { rebuildActiveChannelsCache } from "@/lib/active-channels-cache";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";
import type { AppDatabase } from "../context";

type YouTubeChannelsResponse = {
  items?: Array<{
    id?: string | null;
    snippet?: {
      title?: string;
      description?: string;
    };
  }>;
};

const MAX_BATCH_SIZE = 50;
const CHANNEL_CHECK_QUEUE_KEY = "checkQueue:channels:v1";
const CHANNEL_CHECK_CURSOR_KEY = "checkQueue:channels:cursor";

export function registerPostChannelsCheck(app: Hono<AdminEnv>) {
  // キュー再構築エンドポイント: 日次ジョブから叩き、重い SELECT を 1 日 1 回に抑えます。
  app.post("/channels/check/queue/rebuild", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);
    const kv = env.LAFTER;

    const fail = (message: string, status: ContentfulStatusCode = 400) => c.json({ message }, status);

    if (!kv) {
      return fail("Workers KV LAFTER バインディングが設定されていません。", 500);
    }

    const queue = await rebuildChannelCheckQueue(db, kv);
    return c.json({
      message: "チャンネル存在チェック用キューを再構築しました。",
      total: queue.length,
      queueKey: CHANNEL_CHECK_QUEUE_KEY,
      cursorKey: CHANNEL_CHECK_CURSOR_KEY,
    });
  });

  // チャンネル存在確認エンドポイント: Cron ワーカーと管理画面から呼び出します。
  const checkHandler = async (c: Context<AdminEnv>) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);
    const kv = env.LAFTER;

    const fail = (message: string, status: ContentfulStatusCode = 400) => c.json({ message }, status);

    const apiKey =
      env.YOUTUBE_API_KEY ??
      process.env.YOUTUBE_API_KEY ??
      "";

    if (!apiKey) {
      return fail("YOUTUBE_API_KEY が設定されていません。", 500);
    }

    const limit = MAX_BATCH_SIZE;
    // 管理画面から ID 指定がある場合は、そのチャンネル群のみを優先してチェックします。
    const requestedIds = await parseRequestedChannelIds(c);
    let ids: string[] = [];
    let nextCursor = 0;
    let useQueue = false;

    if (requestedIds.length > 0) {
      ids = requestedIds.slice(0, limit);
    } else {
      if (!kv) {
        return fail("Workers KV LAFTER バインディングが設定されていません。", 500);
      }
      // KV に保存済みのキューから対象 ID を取り出します。
      let queue = await loadQueueFromKv(kv);
      if (!queue || queue.length === 0) {
        console.warn(
          "[channels/check] チャンネルチェックキューが見つからなかったため再構築を試みます。",
        );
        queue = await rebuildChannelCheckQueue(db, kv);
      }

      const cursor = await loadCursorFromKv(kv, queue?.length ?? 0);
      const batch = takeQueueBatch(queue ?? [], cursor, limit);
      ids = batch.ids;
      nextCursor = batch.nextCursor;
      useQueue = true;
    }

    if (ids.length === 0) {
      return c.json({
        message: "チェック対象のチャンネルが見つかりませんでした。",
        checked: 0,
        confirmed: 0,
        nameUpdated: 0,
        missing: 0,
        deleted: 0,
      });
    }

    // 既存のチャンネル情報を取得して名前変更の検出に使用します。
    const existingChannels = await db
      .select({ id: channels.id, name: channels.name })
      .from(channels)
      .where(inArray(channels.id, ids));
    const existingChannelMap = new Map(existingChannels.map((ch) => [ch.id, ch.name]));

    // YouTube channels.list API を呼び出します。
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("id", ids.join(","));
    url.searchParams.set("key", apiKey);

    let response: Response;
    try {
      response = await fetch(url.toString());
    } catch (error) {
      console.error("[channels/check] YouTube API の呼び出しに失敗しました。", error);
      return fail("YouTube API の呼び出しに失敗しました。", 502);
    }

    if (!response.ok) {
      console.error(
        "[channels/check] YouTube API エラー",
        response.status,
        response.statusText,
      );
      return fail(`YouTube API の応答が不正です。(HTTP ${response.status})`, 502);
    }

    let data: YouTubeChannelsResponse;
    try {
      data = (await response.json()) as YouTubeChannelsResponse;
    } catch (error) {
      console.error("[channels/check] YouTube API 応答のJSON化に失敗しました。", error);
      return fail("YouTube API の応答を JSON として解釈できませんでした。", 502);
    }

    // チャンネルIDと名前のマップを作成します。
    const foundChannels = new Map<string, { title: string }>();
    for (const item of data.items ?? []) {
      if (typeof item.id === "string" && item.id && item.snippet?.title) {
        foundChannels.set(item.id, { title: item.snippet.title });
      }
    }

    const foundIds = new Set(foundChannels.keys());
    const missingIds = ids.filter((id) => !foundIds.has(id));
    const existingIds = Array.from(foundIds);

    const now = new Date().toISOString();
    let nameUpdatedCount = 0;

    // 存在確認できたチャンネルを更新します。
    if (existingIds.length > 0) {
      const { env } = getCloudflareContext();
      const isD1Available = env.DB && typeof env.DB.batch === "function";

      if (isD1Available) {
        // D1環境: batch APIで複数のUPDATEを実行
        const updateStatements = existingIds.map((channelId) => {
          const info = foundChannels.get(channelId);
          const currentName = existingChannelMap.get(channelId);
          if (!info) return null;

          if (currentName !== info.title) {
            nameUpdatedCount++;
            return env.DB.prepare(
              `UPDATE channels SET last_checked_at = ?, name = ? WHERE id = ?`
            ).bind(now, info.title, channelId);
          }
          return env.DB.prepare(
            `UPDATE channels SET last_checked_at = ? WHERE id = ?`
          ).bind(now, channelId);
        }).filter((stmt): stmt is NonNullable<typeof stmt> => stmt !== null);

        const BATCH_SIZE = 100;
        for (let i = 0; i < updateStatements.length; i += BATCH_SIZE) {
          const batch = updateStatements.slice(i, i + BATCH_SIZE);
          await env.DB.batch(batch);
        }
      } else {
        // ローカル環境: drizzle-ormで個別UPDATE
        for (const channelId of existingIds) {
          const info = foundChannels.get(channelId);
          const currentName = existingChannelMap.get(channelId);
          if (info) {
            if (currentName !== info.title) {
              nameUpdatedCount++;
              await db
                .update(channels)
                .set({ lastCheckedAt: now, name: info.title })
                .where(eq(channels.id, channelId));
            } else {
              await db
                .update(channels)
                .set({ lastCheckedAt: now })
                .where(eq(channels.id, channelId));
            }
          }
        }
      }
    }

    // 存在しないチャンネルは status=2（削除済み）に変更します。
    let deletedCount = 0;
    if (missingIds.length > 0) {
      await db
        .update(channels)
        .set({ lastCheckedAt: now, status: 2 })
        .where(inArray(channels.id, missingIds));
      deletedCount = missingIds.length;
    }

    if (useQueue && kv) {
      await saveCursorToKv(kv, nextCursor);
    }

    if (kv) {
      try {
        // 日次確認の完了時に正本から再構築し、名前変更・削除と更新漏れをまとめて修復します。
        await rebuildActiveChannelsCache(env.DB, kv);
      } catch (error) {
        console.error("[channels/check] アクティブチャンネルKVの更新に失敗しました。", error);
      }
    }

    return c.json(
      {
        message: "チャンネルの存在チェックが完了しました。",
        checked: ids.length,
        confirmed: existingIds.length,
        nameUpdated: nameUpdatedCount,
        missing: missingIds.length,
        deleted: deletedCount,
        limit,
        mode: useQueue ? "queue" : "manual",
        checkedIds: ids,
        missingIds,
      },
      200,
    );
  };

  app.post("/channels/check", checkHandler);
  // 管理画面用に同じ処理を /admin 配下にも公開し、セッション認証で実行できるようにします。
  app.post("/admin/channels/check", checkHandler);
}

async function loadQueueFromKv(kv: KVNamespace): Promise<string[] | null> {
  try {
    const value = await kv.get(CHANNEL_CHECK_QUEUE_KEY);
    if (!value) {
      return null;
    }
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch (error) {
    console.error("[channels/check] キューの読み込みに失敗しました。", error);
    return null;
  }
}

async function loadCursorFromKv(kv: KVNamespace, queueLength: number): Promise<number> {
  if (!kv) {
    return 0;
  }
  try {
    const value = await kv.get(CHANNEL_CHECK_CURSOR_KEY);
    const parsed = value ? Number.parseInt(value, 10) : 0;
    if (Number.isFinite(parsed) && parsed >= 0) {
      return normalizeCursor(parsed, queueLength);
    }
  } catch (error) {
    console.error("[channels/check] カーソルの読み込みに失敗しました。", error);
  }
  return 0;
}

async function saveCursorToKv(kv: KVNamespace, cursor: number): Promise<void> {
  try {
    await kv.put(CHANNEL_CHECK_CURSOR_KEY, String(cursor));
  } catch (error) {
    console.error("[channels/check] カーソルの保存に失敗しました。", error);
  }
}

function takeQueueBatch(
  queue: string[],
  cursor: number,
  batchSize: number,
): { ids: string[]; nextCursor: number } {
  if (queue.length === 0) {
    return { ids: [], nextCursor: 0 };
  }
  if (batchSize <= 0) {
    return { ids: [], nextCursor: normalizeCursor(cursor, queue.length) };
  }

  const safeCursor = normalizeCursor(cursor, queue.length);
  const ids: string[] = [];
  let nextIndex = safeCursor;

  while (nextIndex < queue.length && ids.length < batchSize) {
    ids.push(queue[nextIndex]);
    nextIndex += 1;
  }

  if (nextIndex >= queue.length) {
    return { ids, nextCursor: 0 };
  }
  return { ids, nextCursor: nextIndex };
}

function normalizeCursor(cursor: number, queueLength: number): number {
  if (queueLength <= 0) {
    return 0;
  }
  if (!Number.isFinite(cursor) || cursor < 0) {
    return 0;
  }
  return cursor < queueLength ? cursor : 0;
}

async function parseRequestedChannelIds(
  c: Context<AdminEnv>,
): Promise<string[]> {
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return [];
  }

  try {
    const body = await c.req.json() as { channelIds?: unknown };
    if (!Array.isArray(body.channelIds)) {
      return [];
    }
    // 入力配列を正規化し、空文字・重複・上限超過を丁寧に抑えます。
    const uniqueIds = new Set<string>();
    for (const value of body.channelIds) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      uniqueIds.add(trimmed);
      if (uniqueIds.size >= MAX_BATCH_SIZE) {
        break;
      }
    }
    return Array.from(uniqueIds);
  } catch {
    return [];
  }
}

async function rebuildChannelCheckQueue(db: AppDatabase, kv: KVNamespace): Promise<string[]> {
  try {
    const rows = await db
      .select({
        id: channels.id,
      })
      .from(channels)
      // status=1（登録済み）のチャンネルのみを対象とします。
      .where(eq(channels.status, 1))
      // lastCheckedAt の昇順かつ createdAt の昇順で並べ、古いチャンネルを優先的にチェックします。
      .orderBy(asc(channels.lastCheckedAt), asc(channels.createdAt));
    const queue = rows.map((row) => row.id);
    await kv.put(CHANNEL_CHECK_QUEUE_KEY, JSON.stringify(queue));
    await kv.put(CHANNEL_CHECK_CURSOR_KEY, "0");
    console.log("[channels/check] チャンネルチェックキューを KV に保存しました。", {
      queueKey: CHANNEL_CHECK_QUEUE_KEY,
      count: queue.length,
    });
    return queue;
  } catch (error) {
    console.error("[channels/check] チャンネルチェックキューの再構築に失敗しました。", error);
    return [];
  }
}
