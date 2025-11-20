import { Hono } from "hono";
import { ADMIN_SECRET_HEADER } from "@/lib/api-secret";

type CronEnv = Env & {
  API_BASE?: string;
  API_SECRET?: string;
  CRON_CHANNEL_BATCH_LIMIT?: string | number;
  CRON_CHANNEL_DELAY_MS?: string | number;
};

type ChannelRow = { id: string };
const DAILY_CHANNEL_LIMIT = 100;

const app = new Hono();

// Worker が有効かどうかを簡易確認するための疎通用エンドポイントです。
app.get("/", (c) => c.text("Cron worker is alive."));

// Cron Trigger(例: 0 5 * * *) から呼ばれるハンドラを丁寧に定義します。
const scheduled: ExportedHandlerScheduledHandler = async (_event, env, ctx) => {
  ctx.waitUntil(runChannelSearchCron(env as CronEnv));
};

export default {
  fetch: app.fetch,
  scheduled,
};

async function runChannelSearchCron(env: CronEnv) {
  const base = resolveBaseUrl(env);
  const secret = resolveSecret(env);
  const batchLimit = resolveNumber(env.CRON_CHANNEL_BATCH_LIMIT, 20);
  const delayMs = resolveNumber(env.CRON_CHANNEL_DELAY_MS, 1000);

  if (!base || !secret) {
    console.error("[cron] 必要な環境変数(API_BASE/API_SECRET)が設定されていません。");
    return;
  }

  // status=1 かつ 24 時間以上未確認のチャンネルのみを丁寧に抽出し、1日に最大100件まで処理します。
  const channels = await fetchPendingChannels(env, Math.min(batchLimit, DAILY_CHANNEL_LIMIT));
  if (channels.length === 0) {
    console.log("[cron] status=1 のチャンネルはありませんでした。");
    return;
  }

  let shouldStop = false;
  for (const ch of channels) {
    if (!ch?.id) continue;
    // チャンネル内の動画(status=1)が50件以上ある場合のみ全ページ検索を行い、それ以外は1ページだけに抑えます。
    const isFullSearch = await shouldUseFullSearch(env, ch.id);
    const url = `${base}/admin/channels/search?channelId=${encodeURIComponent(
      ch.id,
    )}&isFullSearch=${isFullSearch ? "true" : "false"}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { [ADMIN_SECRET_HEADER]: secret },
      });
      if (!res.ok) {
        console.error("[cron] search 呼び出しに失敗しました", ch.id, res.status);
        shouldStop = true;
      } else {
        console.log("[cron] search 実行済み", ch.id);
      }
    } catch (error) {
      console.error("[cron] search 呼び出しで例外が発生しました", ch.id, error);
      shouldStop = true;
    }

    if (shouldStop) {
      // エラーが発生した時点でループを丁寧に終了します。
      break;
    }

    // YouTube API のクォータを丁寧に配慮し、一定間隔を空けます。
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
}

function resolveBaseUrl(env: CronEnv): string | null {
  const candidates = [env.API_BASE, process.env.API_BASE];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().replace(/\/$/, "") + "/api";
    }
  }
  return null;
}

function resolveSecret(env: CronEnv): string | null {
  const candidates = [env.API_SECRET, process.env.API_SECRET];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function resolveNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shouldUseFullSearch(env: CronEnv, channelId: string): Promise<boolean> {
  // D1 を直接参照し、当該チャンネルの status=1 動画件数を丁寧に確認します。
  const count = await countStatusOneVideos(env, channelId);
  return count >= 50;
}

async function countStatusOneVideos(env: CronEnv, channelId: string): Promise<number> {
  try {
    const row = await env.lafter_db
      .prepare("SELECT COUNT(*) as cnt FROM videos WHERE channel_id = ? AND status = 1")
      .bind(channelId)
      .first<{ cnt: number }>();
    return typeof row?.cnt === "number" && Number.isFinite(row.cnt) ? row.cnt : 0;
  } catch (error) {
    console.error("[cron] 動画件数の取得に失敗しました", channelId, error);
    return 0;
  }
}

async function fetchPendingChannels(env: CronEnv, limit: number): Promise<ChannelRow[]> {
  try {
    // lastCheckedAt が 24 時間以上前または未設定のチャンネルのみを丁寧に抽出します。
    const rows = await env.lafter_db
      .prepare(
        `
        SELECT id
        FROM channels
        WHERE status = 1
          AND (
            last_checked_at IS NULL
            OR last_checked_at <= datetime('now', '-1 day')
          )
        ORDER BY
          last_checked_at IS NOT NULL,
          last_checked_at ASC,
          created_at ASC
        LIMIT ?
      `,
      )
      .bind(limit)
      .all<ChannelRow>();
    return Array.isArray(rows?.results) ? rows.results : [];
  } catch (error) {
    console.error("[cron] チャンネル取得に失敗しました", error);
    return [];
  }
}
