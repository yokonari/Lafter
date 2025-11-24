import { Hono } from "hono";
import { ADMIN_SECRET_HEADER } from "@/lib/api-secret";

type CronEnv = Env & {
    API_BASE?: string;
    API_SECRET?: string;
};

const app = new Hono();

app.get("/", (c) => c.text("LLM Classification Cron worker is alive."));

const scheduled: ExportedHandlerScheduledHandler = async (_event, env, ctx) => {
    ctx.waitUntil(runLlmClassificationCron(env as CronEnv));
};

const cronWorker = {
    fetch: app.fetch,
    scheduled,
};

export default cronWorker;

async function runLlmClassificationCron(env: CronEnv) {
    const base = resolveBaseUrl(env);
    const secret = resolveSecret(env);

    if (!base || !secret) {
        console.error("[cron-llm] 必要な環境変数(API_BASE/API_SECRET)が設定されていません。");
        return;
    }

    const classifyUrl = `${base}/classify`;
    console.log("[cron-llm] LLM 判定を開始します。", classifyUrl);

    try {
        const res = await fetch(classifyUrl, {
            method: "POST",
            headers: {
                [ADMIN_SECRET_HEADER]: secret,
                "content-type": "application/json",
            },
            // 上限50件とするため、exhaustive は指定しない（デフォルト動作、または false）
            // useLLM: true で LLM 判定モードを有効化
            body: JSON.stringify({ useLLM: true }),
        });

        if (!res.ok) {
            console.error("[cron-llm] LLM 判定の呼び出しに失敗しました。", res.status);
            return;
        }

        try {
            const summary = (await res.json()) as Record<string, unknown>;
            console.log(
                "[cron-llm] LLM 判定実行済み",
                `処理数=${summary?.count ?? "?"}件`,
                `ループ=${(summary?.meta as Record<string, unknown>)?.loops ?? "?"}`,
            );
        } catch {
            console.log("[cron-llm] LLM 判定実行済み (応答JSONのパースに失敗しました)");
        }
    } catch (error) {
        console.error("[cron-llm] LLM 判定呼び出しで例外が発生しました。", error);
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
