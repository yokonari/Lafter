import type { KVNamespace } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { saveVideoCache } from "@/lib/video-cache";

type CronEnv = Env & {
  DB?: D1Database;
  lafter_db?: D1Database;
  LAFTER?: KVNamespace;
};

type PopularVideoRow = {
  channel_id: string;
  channel_name: string | null;
  video_id: string;
  video_title: string;
  view_count: number | null;
};

type PopularVideoPayload = {
  channel_id: string;
  channel_name: string;
  video_id: string;
  video_title: string;
  view_count: number;
};

type PopularPeriod = "all" | "year" | "month";

type PeriodConfig = {
  period: PopularPeriod;
  key: string;
  sinceIso?: string;
};

const CACHE_LIMIT = 500;
const CACHE_KEYS: Record<PopularPeriod, string> = {
  all: "views_active_videos_all",
  year: "views_active_videos_year",
  month: "views_active_videos_month",
};

const app = new Hono();

// Worker の稼働確認用の疎通エンドポイントを丁寧に用意しておきます。
app.get("/", (c) => c.text("Popular videos cache cron worker is alive."));

const scheduled: ExportedHandlerScheduledHandler = async (_event, env, ctx) => {
  ctx.waitUntil(runPopularVideosCacheCron(env as CronEnv));
};

const cronWorker = {
  fetch: app.fetch,
  scheduled,
};

export default cronWorker;

async function runPopularVideosCacheCron(env: CronEnv) {
  const db = resolveDb(env);
  const kv = env.LAFTER;
  if (!db) {
    console.error("[cron-popular-videos] D1 バインディング(DB/lafter_db)が見つかりません。");
    return;
  }
  if (!kv) {
    console.error("[cron-popular-videos] Workers KV LAFTER バインディングが設定されていません。");
    return;
  }

  const now = Date.now();
  const periodConfigs: PeriodConfig[] = [
    {
      period: "all",
      key: CACHE_KEYS.all,
    },
    {
      period: "year",
      key: CACHE_KEYS.year,
      sinceIso: new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      period: "month",
      key: CACHE_KEYS.month,
      sinceIso: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  for (const config of periodConfigs) {
    const rows = await fetchPopularVideos(db, CACHE_LIMIT, config.sinceIso);
    if (rows.length === 0) {
      console.warn("[cron-popular-videos] KV へ保存する人気動画が見つかりませんでした。", {
        period: config.period,
      });
      continue;
    }

    const payload: PopularVideoPayload[] = rows.map((row) => ({
      channel_id: row.channel_id,
      channel_name: row.channel_name ?? row.channel_id,
      video_id: row.video_id,
      video_title: row.video_title,
      view_count: row.view_count ?? 0,
    }));

    await saveToKv(kv, config.key, payload, config.period);
  }
}

async function fetchPopularVideos(
  db: D1Database,
  limit: number,
  sinceIso?: string,
): Promise<PopularVideoRow[]> {
  try {
    const baseQuery = `
        SELECT
          v.channel_id AS channel_id,
          c.name AS channel_name,
          v.id AS video_id,
          v.title AS video_title,
          v.view_count AS view_count
        FROM videos v
        INNER JOIN channels c ON v.channel_id = c.id
        WHERE
          v.status IN (1, 3)
          AND c.status = 1
          AND v.view_count IS NOT NULL
      `;

    const whereClause = sinceIso ? `${baseQuery} AND v.published_at >= ?` : baseQuery;
    const orderClause = `
        ORDER BY v.view_count DESC, v.published_at DESC
        LIMIT ?
      `;

    const statement = db.prepare(`${whereClause}${orderClause}`);
    const bound = sinceIso ? statement.bind(sinceIso, limit) : statement.bind(limit);
    const result = await bound.all<PopularVideoRow>();
    const rows = Array.isArray(result?.results) ? result.results : [];
    return rows.filter(
      (row): row is PopularVideoRow =>
        typeof row?.channel_id === "string" &&
        row.channel_id !== "" &&
        typeof row?.video_id === "string" &&
        row.video_id !== "" &&
        typeof row?.video_title === "string" &&
        row.video_title !== "",
    );
  } catch (error) {
    console.error("[cron-popular-videos] 人気動画一覧の取得に失敗しました。", error);
    return [];
  }
}

async function saveToKv(
  kv: KVNamespace,
  key: string,
  payload: PopularVideoPayload[],
  period: PopularPeriod,
): Promise<void> {
  try {
    await saveVideoCache(kv, key, payload);
    console.log("[cron-popular-videos] 人気動画リストを KV へ保存しました。", {
      count: payload.length,
      key,
      period,
    });
  } catch (error) {
    console.error("[cron-popular-videos] 人気動画リストの KV 保存に失敗しました。", {
      key,
      period,
      error,
    });
  }
}

function resolveDb(env: CronEnv): D1Database | null {
  return env.DB ?? env.lafter_db ?? null;
}
