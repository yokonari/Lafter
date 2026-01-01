import type { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, asc, desc, gte, inArray, isNull } from "drizzle-orm";
import type { KVNamespace } from "@cloudflare/workers-types";
import { videos } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";
import type { AppDatabase } from "../context";

type YouTubeVideosResponse = {
  items?: Array<{
    id?: string | null;
    snippet?: {
      publishedAt?: string;
      channelId?: string;
      title?: string;
    };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
    };
  }>;
};

const MAX_BATCH_SIZE = 30;
const VIDEO_CHECK_QUEUE_KEY = "checkQueue:videos:v1";
const VIDEO_CHECK_CURSOR_KEY = "checkQueue:videos:cursor";
const FRESH_VIDEO_LOOKBACK_HOURS = 24;
const FRESH_VIDEO_BATCH_LIMIT = 10;

/**
 * 再生数といいね数から人気度スコアを計算します
 * @param viewCount 再生数
 * @param likeCount いいね数
 * @returns 人気度スコア(整数、1000倍して丸めた値)
 */
function calculatePopularityScore(viewCount: number, likeCount: number): number {
  const score = Math.log(viewCount + 1) + 2 * Math.log(likeCount + 1);
  return Math.round(score * 1000);
}

export function registerPostVideosCheck(app: Hono<AdminEnv>) {
  // Queue 再構築専用エンドポイントを日次ジョブから叩き、重い SELECT を 1 日 1 回に抑えます。
  app.post("/videos/check/queue/rebuild", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);
    const kv = env.LAFTER;

    const fail = (message: string, status: ContentfulStatusCode = 400) => c.json({ message }, status);

    if (!kv) {
      return fail("Workers KV LAFTER バインディングが設定されていません。", 500);
    }

    const queue = await rebuildVideoCheckQueue(db, kv);
    return c.json({
      message: "動画存在チェック用キューを再構築しました。",
      total: queue.length,
      queueKey: VIDEO_CHECK_QUEUE_KEY,
      cursorKey: VIDEO_CHECK_CURSOR_KEY,
    });
  });

  // Cron ワーカーから直接呼べるよう /admin プレフィックス外に公開し、共有シークレットで丁寧に防御します。
  app.post("/videos/check", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);
    const kv = env.LAFTER;

    const fail = (message: string, status: ContentfulStatusCode = 400) => c.json({ message }, status);

    const apiKey =
      env.YOUTUBE_API_KEY ??
      // ローカル開発でも丁寧に動作するよう process.env からのフォールバックも許容します。
      process.env.YOUTUBE_API_KEY ??
      "";

    if (!apiKey) {
      return fail("YOUTUBE_API_KEY が設定されていません。", 500);
    }

    if (!kv) {
      return fail("Workers KV LAFTER バインディングが設定されていません。", 500);
    }

    // Cron からの定期実行に特化させるため、リクエストボディは受け付けず定数で動作させます。
    const limit = MAX_BATCH_SIZE;
    const deleteMissing = true;

    // KV に保存済みのキューから対象 ID を丁寧に取り出し、重い ORDER BY を日次キュー更新に閉じ込めます。
    let queue = await loadQueueFromKv(kv);
    if (!queue || queue.length === 0) {
      console.warn(
        "[admin/videos/check] 動画チェックキューが見つからなかったため再構築を試みます。",
      );
      queue = await rebuildVideoCheckQueue(db, kv);
    }

    const freshIds = await fetchFreshVideoIds(db, Math.min(limit, FRESH_VIDEO_BATCH_LIMIT));
    const remainingSlots = Math.max(limit - freshIds.length, 0);
    const cursor = await loadCursorFromKv(kv, queue?.length ?? 0);

    const { ids: queueIds, nextCursor } = takeQueueBatch(queue ?? [], cursor, remainingSlots, new Set(freshIds));
    const ids = [...freshIds, ...queueIds];

    if (ids.length === 0) {
      return c.json({
        message: "チェック対象の動画が見つかりませんでした。",
        requestedStatus: 1,
        checked: 0,
        missing: 0,
        deleted: 0,
      });
    }

    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    // 動画の統計情報(再生数、いいね数)を取得するため snippet と statistics を含めます。
    url.searchParams.set("part", "snippet,statistics");
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

    // 動画IDと統計情報のマップを作成します。
    const videoStats = new Map<
      string,
      {
        viewCount: number;
        likeCount: number;
        popularityScore: number;
      }
    >();

    for (const item of data.items ?? []) {
      if (typeof item.id === "string" && item.id) {
        const viewCount = Number.parseInt(item.statistics?.viewCount ?? "0", 10);
        const likeCount = Number.parseInt(item.statistics?.likeCount ?? "0", 10);
        const popularityScore = calculatePopularityScore(viewCount, likeCount);

        videoStats.set(item.id, {
          viewCount,
          likeCount,
          popularityScore,
        });
      }
    }

    const foundIds = new Set(videoStats.keys());
    const missingIds = ids.filter((id) => !foundIds.has(id));
    const existingIds = Array.from(foundIds);

    const now = new Date().toISOString();
    if (existingIds.length > 0) {
      // 存在確認できた動画は lastCheckedAt と統計情報を一括で更新します。
      // 個別のUPDATEクエリではなく、1回のクエリで全件更新することでCPU時間を大幅に削減します。
      const { sql } = await import("drizzle-orm");

      // CASE文を使って各動画IDに対応する統計情報を設定
      const viewCountCase = sql`CASE ${videos.id}`;
      const likeCountCase = sql`CASE ${videos.id}`;
      const popularityScoreCase = sql`CASE ${videos.id}`;

      for (const videoId of existingIds) {
        const stats = videoStats.get(videoId);
        if (stats) {
          viewCountCase.append(sql` WHEN ${videoId} THEN ${stats.viewCount}`);
          likeCountCase.append(sql` WHEN ${videoId} THEN ${stats.likeCount}`);
          popularityScoreCase.append(sql` WHEN ${videoId} THEN ${stats.popularityScore}`);
        }
      }

      viewCountCase.append(sql` END`);
      likeCountCase.append(sql` END`);
      popularityScoreCase.append(sql` END`);

      await db
        .update(videos)
        .set({
          lastCheckedAt: now,
          viewCount: viewCountCase,
          likeCount: likeCountCase,
          popularityScore: popularityScoreCase,
        })
        .where(inArray(videos.id, existingIds));
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

    await saveCursorToKv(kv, nextCursor);

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

async function fetchFreshVideoIds(db: AppDatabase, limit: number): Promise<string[]> {
  if (limit <= 0) {
    return [];
  }
  const threshold = new Date(Date.now() - FRESH_VIDEO_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  try {
    // 直近追加され、まだ一度も存在確認されていない動画を優先的に拾い上げ、24 時間以内に確実へチェックさせます。
    const rows = await db
      .select({ id: videos.id })
      .from(videos)
      .where(
        and(inArray(videos.status, [1, 3]), isNull(videos.lastCheckedAt), gte(videos.createdAt, threshold)),
      )
      .orderBy(desc(videos.createdAt))
      .limit(limit);
    return rows.map((row) => row.id);
  } catch (error) {
    console.error("[admin/videos/check] 新着動画抽出に失敗しました。", error);
    return [];
  }
}

async function loadQueueFromKv(kv: KVNamespace): Promise<string[] | null> {
  try {
    const value = await kv.get(VIDEO_CHECK_QUEUE_KEY);
    if (!value) {
      return null;
    }
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch (error) {
    console.error("[admin/videos/check] キューの読み込みに失敗しました。", error);
    return null;
  }
}

async function loadCursorFromKv(kv: KVNamespace, queueLength: number): Promise<number> {
  if (!kv) {
    return 0;
  }
  try {
    const value = await kv.get(VIDEO_CHECK_CURSOR_KEY);
    const parsed = value ? Number.parseInt(value, 10) : 0;
    if (Number.isFinite(parsed) && parsed >= 0) {
      return normalizeCursor(parsed, queueLength);
    }
  } catch (error) {
    console.error("[admin/videos/check] カーソルの読み込みに失敗しました。", error);
  }
  return 0;
}

async function saveCursorToKv(kv: KVNamespace, cursor: number): Promise<void> {
  try {
    await kv.put(VIDEO_CHECK_CURSOR_KEY, String(cursor));
  } catch (error) {
    console.error("[admin/videos/check] カーソルの保存に失敗しました。", error);
  }
}

function takeQueueBatch(
  queue: string[],
  cursor: number,
  batchSize: number,
  skipIds: Set<string>,
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

  // キューの並び順を崩さないよう連続領域から丁寧に抽出しつつ、freshIds と重複する ID はスキップします。
  while (nextIndex < queue.length && ids.length < batchSize) {
    const candidate = queue[nextIndex];
    nextIndex += 1;
    if (skipIds.has(candidate)) {
      continue;
    }
    ids.push(candidate);
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

async function rebuildVideoCheckQueue(db: AppDatabase, kv: KVNamespace): Promise<string[]> {
  try {
    const rows = await db
      .select({
        id: videos.id,
      })
      .from(videos)
      // 公開済み(status=1)と一時的に調整が必要な動画(status=3)を丁寧に対象へ含め、利用者向け一覧の健全性を守ります。
      .where(inArray(videos.status, [1, 3]))
      // lastCheckedAt の昇順かつ公開日時の降順で丁寧に並べ、最新公開の動画を優先的にチェックします。
      .orderBy(asc(videos.lastCheckedAt), desc(videos.publishedAt));
    const queue = rows.map((row) => row.id);
    await kv.put(VIDEO_CHECK_QUEUE_KEY, JSON.stringify(queue));
    await kv.put(VIDEO_CHECK_CURSOR_KEY, "0");
    console.log("[admin/videos/check] 動画チェックキューを KV に保存しました。", {
      queueKey: VIDEO_CHECK_QUEUE_KEY,
      count: queue.length,
    });
    return queue;
  } catch (error) {
    console.error("[admin/videos/check] 動画チェックキューの再構築に失敗しました。", error);
    return [];
  }
}
