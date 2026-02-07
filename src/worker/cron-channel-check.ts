import { Hono } from "hono";
import { ADMIN_SECRET_HEADER } from "@/lib/api-secret";

type CronEnv = Env & {
  API_BASE?: string;
  API_SECRET?: string;
};

const app = new Hono();

// 動作確認用の ping エンドポイントです。
app.get("/", (c) => c.text("Channel check Cron worker is alive."));

const scheduled: ExportedHandlerScheduledHandler = async (_event, env, ctx) => {
  ctx.waitUntil(runChannelCheckCron(env as CronEnv));
};

const cronWorker = {
  fetch: app.fetch,
  scheduled,
};

export default cronWorker;

async function runChannelCheckCron(env: CronEnv) {
  const base = resolveBaseUrl(env);
  const secret = resolveSecret(env);

  if (!base || !secret) {
    console.error("[cron-channel-check] 必要な環境変数(API_BASE/API_SECRET)が設定されていません。");
    return;
  }

  const url = `${base}/channels/check`;
  console.log("[cron-channel-check] チャンネル存在チェックを開始します。", url);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        [ADMIN_SECRET_HEADER]: secret,
      },
    });

    if (!res.ok) {
      console.error("[cron-channel-check] チャンネルチェックAPIの呼び出しに失敗しました。", res.status);
      return;
    }

    try {
      const summary = (await res.json()) as Record<string, unknown>;
      console.log(
        "[cron-channel-check] チャンネルチェック実行済み",
        `確認数=${summary?.checked ?? "?"}件`,
        `名前更新=${summary?.nameUpdated ?? "?"}件`,
        `欠損=${summary?.missing ?? "?"}件`,
        `削除=${summary?.deleted ?? "?"}件`,
      );
    } catch {
      console.log("[cron-channel-check] チャンネルチェック実行済み (応答JSONのパースに失敗しました)");
    }
  } catch (error) {
    console.error("[cron-channel-check] チャンネルチェック呼び出しで例外が発生しました。", error);
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
