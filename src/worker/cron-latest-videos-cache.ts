import type { KVNamespace } from "@cloudflare/workers-types";
import { Hono } from "hono";

type CronEnv = Env & {
  DB?: D1Database;
  lafter_db?: D1Database;
  LAFTER?: KVNamespace;
};

type LatestVideoRow = {
  channel_id: string;
  channel_name: string | null;
  video_id: string;
  video_title: string;
};

type LatestVideoPayload = {
  channel_id: string;
  channel_name: string;
  video_id: string;
  video_title: string;
};

type LatestVideoCache = {
  updated_at: string;
  items: LatestVideoPayload[];
};

const CACHE_LIMIT = 500;
const CACHE_KEY = "latest_active_videos";

const app = new Hono();

// Worker の稼働確認用の疎通エンドポイントを丁寧に用意しておきます。
app.get("/", (c) => c.text("Latest videos cache cron worker is alive."));

const scheduled: ExportedHandlerScheduledHandler = async (_event, env, ctx) => {
  ctx.waitUntil(runLatestVideosCacheCron(env as CronEnv));
};

const cronWorker = {
  fetch: app.fetch,
  scheduled,
};

export default cronWorker;

async function runLatestVideosCacheCron(env: CronEnv) {
  const db = resolveDb(env);
  const kv = env.LAFTER;
  if (!db) {
    console.error("[cron-latest-videos] D1 バインディング(DB/lafter_db)が見つかりません。");
    return;
  }
  if (!kv) {
    console.error("[cron-latest-videos] Workers KV LAFTER バインディングが設定されていません。");
    return;
  }

  // 最新公開日順に 500 件の動画を抽出し、KV 用のプレーンな配列へ丁寧に変換します。
  const rows = await fetchLatestVideos(db, CACHE_LIMIT);
  if (rows.length === 0) {
    console.warn("[cron-latest-videos] KV へ保存する対象動画が見つかりませんでした。");
  }

  const payload: LatestVideoPayload[] = rows.map((row) => ({
    channel_id: row.channel_id,
    // channels.name が null の場合も ID で補い、キャッシュ参照時の情報欠落を丁寧に防ぎます。
    channel_name: row.channel_name ?? row.channel_id,
    video_id: row.video_id,
    video_title: row.video_title,
  }));

  await saveToKv(kv, payload);
}

async function fetchLatestVideos(db: D1Database, limit: number): Promise<LatestVideoRow[]> {
  try {
    // channels.status=1 のチャンネルのみを JOIN で抽出し、動画・チャンネル情報を同時に整えます。
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
        ORDER BY v.published_at DESC
        LIMIT ?
      `,
      )
      .bind(limit)
      .all<LatestVideoRow>();
    const rows = Array.isArray(result?.results) ? result.results : [];
    // SQL 結果に null/空文字が混ざる想定に備え、KV 保存用の最低限の値を丁寧に保証します。
    return rows.filter(
      (row): row is LatestVideoRow =>
        typeof row?.channel_id === "string" &&
        row.channel_id !== "" &&
        typeof row?.video_id === "string" &&
        row.video_id !== "" &&
        typeof row?.video_title === "string" &&
        row.video_title !== "",
    );
  } catch (error) {
    console.error("[cron-latest-videos] 動画一覧の取得に失敗しました。", error);
    return [];
  }
}

async function saveToKv(kv: KVNamespace, payload: LatestVideoPayload[]): Promise<void> {
  try {
    // 最新更新時刻と動画リストを一つの JSON value にまとめて保存し、後段利用時の拡張性を丁寧に確保します。
    const cache: LatestVideoCache = {
      updated_at: new Date().toISOString(),
      items: payload,
    };
    await kv.put(CACHE_KEY, JSON.stringify(cache));
    console.log("[cron-latest-videos] 最新動画リストを KV へ保存しました。", {
      count: payload.length,
      key: CACHE_KEY,
    });
  } catch (error) {
    console.error("[cron-latest-videos] 最新動画リストの KV 保存に失敗しました。", error);
  }
}

function resolveDb(env: CronEnv): D1Database | null {
  // Wrangler 側の DB バインディング名ゆらぎを丁寧に吸収し、安全に D1 インスタンスを返します。
  return env.DB ?? env.lafter_db ?? null;
}
