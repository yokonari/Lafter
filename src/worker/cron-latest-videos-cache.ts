import type { KVNamespace } from "@cloudflare/workers-types";
import { Hono } from "hono";

type CronEnv = Env & {
  DB?: D1Database;
  lafter_db?: D1Database;
  LAFTER?: KVNamespace;
};

type LatestVideoRow = {
  channel_id: string;
  video_id: string;
  video_title: string;
};

type LatestVideoPayload = {
  channel_id: string;
  channel_name: string;
  video_id: string;
  video_title: string;
};

type ActiveChannelRecord = {
  channel_id?: string;
  channel_name?: string | null;
};

type LatestVideoCache = {
  updated_at: string;
  items: LatestVideoPayload[];
};

const CACHE_LIMIT = 500;
const CACHE_KEY = "latest_active_videos";
const ACTIVE_CHANNELS_KEY = "active_channels";

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

  const activeChannelMap = await loadActiveChannelMap(kv);
  if (!activeChannelMap) {
    console.error("[cron-latest-videos] active_channels の読み込みに失敗したため処理を中断します。");
    return;
  }

  // 最新公開日順に 500 件の動画を抽出し、KV 用のプレーンな配列へ丁寧に変換します。
  const rows = await fetchLatestVideos(db, CACHE_LIMIT);
  if (rows.length === 0) {
    console.warn("[cron-latest-videos] KV へ保存する対象動画が見つかりませんでした。");
  }

  const payload: LatestVideoPayload[] = rows.map((row) => ({
    channel_id: row.channel_id,
    // active_channels に存在しない場合も ID を名称のフォールバックとして利用し、KV 参照時の情報欠落を丁寧に防ぎます。
    channel_name: activeChannelMap.get(row.channel_id) ?? row.channel_id,
    video_id: row.video_id,
    video_title: row.video_title,
  }));

  await saveToKv(kv, payload);
}

async function fetchLatestVideos(db: D1Database, limit: number): Promise<LatestVideoRow[]> {
  try {
    // active_channels に存在する ID かどうかは後段で検証するため、ここでは videos テーブル単体から素直に取得します。
    const result = await db
      .prepare(
        `
        SELECT
          v.channel_id as channel_id,
          v.id as video_id,
          v.title as video_title
        FROM videos v
        WHERE
          v.status IN (1, 3)
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

async function loadActiveChannelMap(kv: KVNamespace): Promise<Map<string, string> | null> {
  try {
    const text = await kv.get(ACTIVE_CHANNELS_KEY, "text");
    if (!text) {
      console.error("[cron-latest-videos] active_channels が KV に存在しません。");
      return null;
    }
    let parsed: ActiveChannelRecord[] = [];
    try {
      parsed = JSON.parse(text) as ActiveChannelRecord[];
    } catch {
      console.error("[cron-latest-videos] active_channels を JSON として解析できませんでした。");
      return null;
    }
    const map = new Map<string, string>();
    for (const entry of parsed) {
      if (entry && typeof entry.channel_id === "string" && entry.channel_id) {
        map.set(entry.channel_id, entry.channel_name ?? "");
      }
    }
    if (map.size === 0) {
      console.error("[cron-latest-videos] active_channels に有効なチャンネルが含まれていません。");
      return null;
    }
    return map;
  } catch (error) {
    console.error("[cron-latest-videos] active_channels の取得に失敗しました。", error);
    return null;
  }
}
