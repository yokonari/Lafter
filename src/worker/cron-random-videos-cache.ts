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
    const result = await db
      .prepare(
        `
        SELECT
          v.channel_id AS channel_id,
          c.name AS channel_name,
          v.id AS video_id,
          v.title AS video_title
        FROM videos v
        INNER JOIN channels c ON v.channel_id = c.id
        WHERE
          v.status IN (1, 3)
          AND c.status = 1
        ORDER BY RANDOM()
        LIMIT ?
      `,
      )
      .bind(limit)
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
  } catch (error) {
    console.error("[cron-random-videos] 動画一覧の取得に失敗しました。", error);
    return [];
  }
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
