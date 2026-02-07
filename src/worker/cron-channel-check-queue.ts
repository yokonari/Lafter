import { Hono } from "hono";
import { ADMIN_SECRET_HEADER } from "@/lib/api-secret";

type CronEnv = Env & {
  API_BASE?: string;
  API_SECRET?: string;
};

const app = new Hono();

// チャンネルチェックキュー構築ジョブの稼働状況を把握できるよう、疎通用エンドポイントを用意します。
app.get("/", (c) => c.text("Channel check queue Cron worker is alive."));

const scheduled: ExportedHandlerScheduledHandler = async (_event, env, ctx) => {
  ctx.waitUntil(runChannelCheckQueueCron(env as CronEnv));
};

const cronWorker = {
  fetch: app.fetch,
  scheduled,
};

export default cronWorker;

async function runChannelCheckQueueCron(env: CronEnv) {
  const base = resolveBaseUrl(env);
  const secret = resolveSecret(env);

  if (!base || !secret) {
    console.error(
      "[cron-channel-check-queue] 必要な環境変数(API_BASE/API_SECRET)が設定されていません。",
    );
    return;
  }

  const url = `${base}/channels/check/queue/rebuild`;
  console.log("[cron-channel-check-queue] チャンネルチェックキューの再構築を開始します。", url);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        [ADMIN_SECRET_HEADER]: secret,
      },
    });

    if (!res.ok) {
      console.error(
        "[cron-channel-check-queue] チャンネルチェックキューの再構築 API 呼び出しに失敗しました。",
        res.status,
      );
      return;
    }

    try {
      const summary = (await res.json()) as Record<string, unknown>;
      console.log(
        "[cron-channel-check-queue] キュー再構築済み",
        `total=${summary?.total ?? "?"}件`,
      );
    } catch {
      console.log("[cron-channel-check-queue] キュー再構築済み (応答JSONのパースに失敗しました)");
    }
  } catch (error) {
    console.error("[cron-channel-check-queue] キュー再構築呼び出しで例外が発生しました。", error);
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
