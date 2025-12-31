import { Hono } from "hono";
import { ADMIN_SECRET_HEADER } from "@/lib/api-secret";

type CronEnv = Env & {
  API_BASE?: string;
  API_SECRET?: string;
  CRON_CHANNEL_BATCH_LIMIT?: string | number;
  CRON_CHANNEL_DELAY_MS?: string | number;
  DB?: D1Database;
  lafter_db?: D1Database;
};

type ChannelRow = { id: string; lastCheckedAt: string | null };
const DAILY_CHANNEL_LIMIT = 100;

const app = new Hono();

// Worker が有効かどうかを簡易確認するための疎通用エンドポイントです。
app.get("/", (c) => c.text("Cron worker is alive."));

// Cron Trigger(例: 0 5 * * *) から呼ばれるハンドラを丁寧に定義します。
const scheduled: ExportedHandlerScheduledHandler = async (_event, env, ctx) => {
  ctx.waitUntil(runChannelSearchCron(env as CronEnv));
};

const cronWorker = {
  fetch: app.fetch,
  scheduled,
};

export default cronWorker;

async function runChannelSearchCron(env: CronEnv) {
  const base = resolveBaseUrl(env);
  const secret = resolveSecret(env);
  const batchLimit = resolveNumber(env.CRON_CHANNEL_BATCH_LIMIT, 3);
  const delayMs = resolveNumber(env.CRON_CHANNEL_DELAY_MS, 1000);

  if (!base || !secret) {
    console.error("[cron] 必要な環境変数(API_BASE/API_SECRET)が設定されていません。");
    return;
  }

  // status=1 かつ last_checked_at が設定されていないチャンネルのみを丁寧に抽出し、1日に最大100件まで処理します。
  const channels = await fetchPendingChannels(env, Math.min(batchLimit, DAILY_CHANNEL_LIMIT));
  if (channels.length === 0) {
    console.log("[cron] status=1 かつ last_checked_at IS NULL のチャンネルはありませんでした。");
    return;
  }

  let shouldStop = false;
  for (const ch of channels) {
    if (!ch?.id) continue;
    // lastCheckedAt が null かつ status=1 の動画が50件以上ある場合のみ全ページ検索を行います。
    const isFullSearch = await shouldUseFullSearch(env, ch);

    // 該当チャンネルの動画がテーブルに100件以上ある場合（ステータス問わず）、最新の動画の日付をpublishedAfterに設定します。
    const totalVideos = await countAllVideos(env, ch.id);
    let publishedAfter: string | undefined;
    if (totalVideos >= 100) {
      publishedAfter = await getLatestPublishedAt(env, ch.id);
    }

    const url = `${base}/channels/search?channelId=${encodeURIComponent(
      ch.id,
    )}&isFullSearch=${isFullSearch ? "true" : "false"}`;
    console.log("[cron] search 実行", ch.id, isFullSearch, publishedAfter, url, secret);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          [ADMIN_SECRET_HEADER]: secret,
          // 本体にもチャンネルIDを積極的に含め、クエリが落ちても確実に伝搬させます。
          "content-type": "application/json",
        },
        body: JSON.stringify({
          // query だけに頼らず channelId を確実に渡すため冗長に指定します。
          channelId: ch.id,
          isFullSearch,
          publishedAfter,
        }),
      });
      if (!res.ok) {
        console.error("[cron] search 呼び出しに失敗しました", ch.id, res.status);
        shouldStop = true;
      } else {
        // 応答内容も把握できるよう、概要を日本語でこまめに記録します。
        try {
          const summary = (await res.json()) as Record<string, unknown>;
          console.log(
            "[cron] search 実行済み",
            ch.id,
            `動画=${summary?.videosInserted ?? "?"}件`,
            `取得=${summary?.fetched ?? "?"}件`,
          );
        } catch {
          console.log("[cron] search 実行済み (応答JSONのパースに失敗しました)", ch.id);
        }
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

function resolveDb(env: CronEnv): D1Database | null {
  // Wrangler 側のバインディング名ゆらぎ(DB/lafter_db)を丁寧に吸収し、安全に D1 インスタンスを返します。
  return env.DB ?? env.lafter_db ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shouldUseFullSearch(env: CronEnv, channel: ChannelRow): Promise<boolean> {
  // lastCheckedAt が null (未チェック) かつ status=1 の動画が20件以上ある場合のみ全件検索を行います。
  if (channel.lastCheckedAt !== null) {
    return false;
  }
  const count = await countStatusOneVideos(env, channel.id);
  return count >= 20;
}

async function countStatusOneVideos(env: CronEnv, channelId: string): Promise<number> {
  const db = resolveDb(env);
  if (!db) {
    return 0;
  }
  try {
    const row = await db
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
  const db = resolveDb(env);
  if (!db) {
    console.error("[cron] D1 バインディング(DB/lafter_db)が見つかりません");
    return [];
  }
  try {
    // lastCheckedAt が NULL のチャンネルのみを丁寧に抽出し、最も古い作成順に巡回していきます。
    // ORDER BY は last_checked_at, created_at の順に揃え、丁寧に巡回順を安定させます。
    const rows = await db
      .prepare(
        `
        SELECT id, last_checked_at as lastCheckedAt
        FROM channels
        WHERE status = 1
          AND last_checked_at IS NULL
        ORDER BY
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

async function countAllVideos(env: CronEnv, channelId: string): Promise<number> {
  const db = resolveDb(env);
  if (!db) {
    return 0;
  }
  try {
    const row = await db
      .prepare("SELECT COUNT(*) as cnt FROM videos WHERE channel_id = ?")
      .bind(channelId)
      .first<{ cnt: number }>();
    return typeof row?.cnt === "number" && Number.isFinite(row.cnt) ? row.cnt : 0;
  } catch (error) {
    console.error("[cron] 全動画件数の取得に失敗しました", channelId, error);
    return 0;
  }
}

async function getLatestPublishedAt(env: CronEnv, channelId: string): Promise<string | undefined> {
  const db = resolveDb(env);
  if (!db) {
    return undefined;
  }
  try {
    const row = await db
      .prepare("SELECT published_at FROM videos WHERE channel_id = ? ORDER BY published_at DESC LIMIT 1")
      .bind(channelId)
      .first<{ published_at: string }>();
    return row?.published_at || undefined;
  } catch (error) {
    console.error("[cron] 最新動画日時の取得に失敗しました", channelId, error);
    return undefined;
  }
}
