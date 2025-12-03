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

async function runVideoRssCron(env: CronEnv) {
  const base = resolveBaseUrl(env);
  const secret = resolveSecret(env);
  if (!base || !secret) {
    console.error("[cron-video-rss] API_BASE または API_SECRET が設定されていません。");
    return;
  }

  const limit = resolveLimit(env);
  const url = new URL(`${base}/videos/rss-sync`);
  if (limit) {
    url.searchParams.set("limit", String(limit));
  }

  console.log("[cron-video-rss] RSS 同期を開始します", url.toString());

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        [ADMIN_SECRET_HEADER]: secret,
      },
    });

    if (!res.ok) {
      console.error("[cron-video-rss] RSS 同期API呼び出しに失敗しました。", res.status, await res.text());
      return;
    }

    try {
      const summary = (await res.json()) as Record<string, unknown>;
      console.log(
        "[cron-video-rss] RSS 同期完了",
        `channels=${summary?.channelsProcessed ?? "?"}`,
        `inserted=${summary?.itemsInserted ?? "?"}`,
        `errors=${Array.isArray(summary?.errors) ? summary.errors.length : "?"}`,
      );
    } catch {
      console.log("[cron-video-rss] RSS 同期完了 (応答JSONのパースに失敗しました)");
    }
  } catch (error) {
    console.error("[cron-video-rss] RSS 同期API呼び出しで例外が発生しました。", error);
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
