import { Hono } from "hono";
import { ADMIN_SECRET_HEADER } from "@/lib/api-secret";

type CronEnv = Env & {
  API_BASE?: string;
  API_SECRET?: string;
  RSS_CHANNEL_LIMIT?: string;
};

const app = new Hono();

// 定期取得ワーカーの動作確認用 ping エンドポイントです。
app.get("/", (c) => c.text("Video RSS Cron worker is alive."));

const scheduled: ExportedHandlerScheduledHandler = async (_event, env, ctx) => {
  ctx.waitUntil(runVideoRssCron(env as CronEnv));
};

const cronWorker = {
  fetch: app.fetch,
  scheduled,
};

export default cronWorker;

const DEFAULT_LIMIT = 50;
const DEFAULT_BATCH_LIMIT = 20;
const MAX_ADDITIONAL_SEARCHES_PER_RUN = 20;

async function runVideoRssCron(env: CronEnv) {
  const base = resolveBaseUrl(env);
  const secret = resolveSecret(env);
  if (!base || !secret) {
    console.error("[cron-video-rss] API_BASE または API_SECRET が設定されていません。");
    return;
  }

  const totalLimit = resolveLimit(env);
  const batchLimit = resolveBatchLimit(totalLimit);
  const summary = {
    channelsProcessed: 0,
    itemsInserted: 0,
    errors: 0,
  };
  const channelsWithMaxInserts = new Set<string>();

  // Subrequest 上限を回避するため、RSS 同期を小分けバッチで順番に実行します。
  let remaining = totalLimit;
  while (remaining > 0) {
    const currentLimit = Math.min(batchLimit, remaining);
    const batchSummary = await runRssSyncBatch(base, secret, currentLimit);
    if (!batchSummary) {
      return;
    }

    summary.channelsProcessed += batchSummary.channelsProcessed;
    summary.itemsInserted += batchSummary.itemsInserted;
    summary.errors += batchSummary.errors;
    for (const channelId of batchSummary.channelsWithMaxInserts) {
      channelsWithMaxInserts.add(channelId);
    }

    // 取得対象が尽きた場合は残りバッチを打ち切ります。
    if (batchSummary.channelsProcessed <= 0) {
      break;
    }

    remaining -= currentLimit;
  }

  console.log(
    "[cron-video-rss] RSS 同期完了",
    `channels=${summary.channelsProcessed}`,
    `inserted=${summary.itemsInserted}`,
    `errors=${summary.errors}`,
  );

  if (channelsWithMaxInserts.size > 0) {
    console.log(`[cron-video-rss] 追加検索対象チャンネル: ${channelsWithMaxInserts.size}件`);
    // /admin/channels/search はセッション認証が必要なため、APIシークレット権限で叩ける /channels/search を使用します。
    const searchBaseUrl = `${base}/channels/search`;
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const publishedAfter = threeDaysAgo.toISOString();

    let searchAttempts = 0;
    for (const channelId of channelsWithMaxInserts) {
      // 追加検索は上限を設け、Cron リクエスト側の subrequest 超過を防ぎます。
      if (searchAttempts >= MAX_ADDITIONAL_SEARCHES_PER_RUN) {
        console.warn(
          "[cron-video-rss] 追加検索の上限に達したため残りをスキップします",
          `limit=${MAX_ADDITIONAL_SEARCHES_PER_RUN}`,
          `remaining=${channelsWithMaxInserts.size - searchAttempts}`,
        );
        break;
      }
      console.log(`[cron-video-rss] 追加検索を実行します channel=${channelId}`);
      try {
        // クエリパラメータで指定して検索APIを呼び出します。
        const searchUrl = new URL(searchBaseUrl);
        searchUrl.searchParams.set("channelId", channelId);
        searchUrl.searchParams.set("isFullSearch", "false");
        searchUrl.searchParams.set("publishedAfter", publishedAfter);

        const searchRes = await fetch(searchUrl.toString(), {
          method: "POST",
          headers: {
            [ADMIN_SECRET_HEADER]: secret,
          },
        });

        if (!searchRes.ok) {
          console.error(`[cron-video-rss] 追加検索に失敗しました channel=${channelId} status=${searchRes.status}`, await searchRes.text());
        } else {
          const searchSummary = await searchRes.json() as { videosInserted?: number };
          console.log(`[cron-video-rss] 追加検索完了 channel=${channelId} inserted=${searchSummary?.videosInserted ?? "?"}`);
        }
      } catch (error) {
        console.error(`[cron-video-rss] 追加検索呼び出しでエラーが発生しました channel=${channelId}`, error);
      }
      searchAttempts += 1;
    }
  }
}

type RssSyncBatchSummary = {
  channelsProcessed: number;
  itemsInserted: number;
  errors: number;
  channelsWithMaxInserts: string[];
};

async function runRssSyncBatch(base: string, secret: string, limit: number): Promise<RssSyncBatchSummary | null> {
  const url = new URL(`${base}/videos/rss-sync`);
  url.searchParams.set("limit", String(limit));
  console.log("[cron-video-rss] RSS 同期バッチを開始します", `limit=${limit}`, url.toString());

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        [ADMIN_SECRET_HEADER]: secret,
      },
    });

    if (!res.ok) {
      console.error("[cron-video-rss] RSS 同期API呼び出しに失敗しました。", res.status, await res.text());
      return null;
    }

    try {
      const body = (await res.json()) as Record<string, unknown>;
      const channelsWithMaxInserts = Array.isArray(body.channelsWithMaxInserts)
        ? body.channelsWithMaxInserts.filter((value): value is string => typeof value === "string")
        : [];
      return {
        channelsProcessed: toNumber(body.channelsProcessed),
        itemsInserted: toNumber(body.itemsInserted),
        errors: Array.isArray(body.errors) ? body.errors.length : 0,
        channelsWithMaxInserts,
      };
    } catch {
      console.log("[cron-video-rss] RSS 同期バッチ完了 (応答JSONのパースに失敗しました)");
      return {
        channelsProcessed: 0,
        itemsInserted: 0,
        errors: 1,
        channelsWithMaxInserts: [],
      };
    }
  } catch (error) {
    console.error("[cron-video-rss] RSS 同期API呼び出しで例外が発生しました。", error);
    return null;
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

function resolveLimit(env: CronEnv): number {
  const candidates = [env.RSS_CHANNEL_LIMIT, process.env.RSS_CHANNEL_LIMIT];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.trunc(parsed);
      }
    }
  }
  return DEFAULT_LIMIT;
}

function resolveBatchLimit(totalLimit: number): number {
  if (totalLimit <= 0) {
    return 1;
  }
  if (totalLimit < DEFAULT_BATCH_LIMIT) {
    return totalLimit;
  }
  return DEFAULT_BATCH_LIMIT;
}

function toNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}
