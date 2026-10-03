import type { KVNamespace } from "@cloudflare/workers-types";
import { Hono } from "hono";

type CronEnv = Env & {
  DB?: D1Database;
  lafter_db?: D1Database;
  LAFTER?: KVNamespace;
};

type RandomVideoRow = {
  channel_id: string;
  channel_name: string | null;
  video_id: string;
  video_title: string;
};

type RandomVideoPayload = {
  channel_id: string;
  channel_name: string;
  video_id: string;
  video_title: string;
};

type RandomVideoCache = {
  updated_at: string;
  items: RandomVideoPayload[];
};

const CACHE_LIMIT = 500;
const CACHE_KEY = "random_active_videos";

const app = new Hono();

// Worker の稼働確認用エンドポイントとして、疎通時に判別しやすいレスポンスを返します。
app.get("/", (c) => c.text("Random videos cache cron worker is alive."));

const scheduled: ExportedHandlerScheduledHandler = async (_event, env, ctx) => {
  ctx.waitUntil(runRandomVideosCacheCron(env as CronEnv));
};

const cronWorker = {
  fetch: app.fetch,
  scheduled,
};

export default cronWorker;

async function runRandomVideosCacheCron(env: CronEnv) {
  const db = resolveDb(env);
  const kv = env.LAFTER;
  if (!db) {
    console.error("[cron-random-videos] D1 バインディング(DB/lafter_db)が見つかりません。");
    return;
  }
  if (!kv) {
    console.error("[cron-random-videos] Workers KV LAFTER バインディングが設定されていません。");
    return;
  }

  // ランダム抽出で 500 件の候補を取得し、channels.status=1 の DB 情報をもとに丁寧に整形します。
  const rows = await fetchRandomVideos(db, CACHE_LIMIT);
  if (rows.length === 0) {
    console.warn("[cron-random-videos] KV へ保存するランダム動画が見つかりませんでした。");
  }

  const payload: RandomVideoPayload[] = rows.map((row) => ({
    channel_id: row.channel_id,
    // チャンネル名が null の場合でも ID を返しておき、利用側の情報欠落を丁寧に防ぎます。
    channel_name: row.channel_name ?? row.channel_id,
    video_id: row.video_id,
    video_title: row.video_title,
  }));

  await saveToKv(kv, payload);
}

async function fetchRandomVideos(db: D1Database, limit: number): Promise<RandomVideoRow[]> {
  try {
    const randomStart = Math.random();
    const firstRows = await fetchRandomVideoRange(db, randomStart, 1, limit);
    if (firstRows.length >= limit) {
      return firstRows;
    }

    // 起点より後ろで不足した分だけ先頭側から補い、重複なしで循環させます。
    const wrappedRows = await fetchRandomVideoRange(
      db,
      randomStart,
      -1,
      limit - firstRows.length,
    );
    return [...firstRows, ...wrappedRows];
  } catch (error) {
    console.error("[cron-random-videos] 動画一覧の取得に失敗しました。", error);
    return [];
  }
}

async function fetchRandomVideoRange(
  db: D1Database,
  randomStart: number,
  direction: 1 | -1,
  limit: number,
): Promise<RandomVideoRow[]> {
  const rangeCondition = direction === 1 ? "v.random_key >= ?" : "v.random_key < ?";
  const result = await db
    .prepare(
      `
        SELECT
          v.channel_id AS channel_id,
          c.name AS channel_name,
          v.id AS video_id,
          v.title AS video_title
        FROM videos v INDEXED BY idx_videos_active_random_key
        INNER JOIN channels c ON v.channel_id = c.id
        WHERE
          v.status IN (1, 3)
          AND c.status = 1
          AND ${rangeCondition}
          AND v.id NOT IN (
            SELECT v2.id
            FROM videos v2 INDEXED BY idx_videos_active_published
            INNER JOIN channels c2 ON v2.channel_id = c2.id
            WHERE v2.status IN (1, 3) AND c2.status = 1
            ORDER BY v2.published_at DESC
            LIMIT 500
          )
        ORDER BY v.random_key ASC
        LIMIT ?
      `,
    )
    .bind(randomStart, limit)
    .all<RandomVideoRow>();
  const rows = Array.isArray(result?.results) ? result.results : [];
  return rows.filter(
    (row): row is RandomVideoRow =>
      typeof row?.channel_id === "string" &&
      row.channel_id !== "" &&
      typeof row?.video_id === "string" &&
      row.video_id !== "" &&
      typeof row?.video_title === "string" &&
      row.video_title !== "",
  );
}

async function saveToKv(kv: KVNamespace, payload: RandomVideoPayload[]): Promise<void> {
  try {
    const cache: RandomVideoCache = {
      updated_at: new Date().toISOString(),
      items: payload,
    };
    await kv.put(CACHE_KEY, JSON.stringify(cache));
    console.log("[cron-random-videos] ランダム動画リストを KV へ保存しました。", {
      count: payload.length,
      key: CACHE_KEY,
    });
  } catch (error) {
    console.error("[cron-random-videos] ランダム動画リストの KV 保存に失敗しました。", error);
  }
}

function resolveDb(env: CronEnv): D1Database | null {
  return env.DB ?? env.lafter_db ?? null;
}
