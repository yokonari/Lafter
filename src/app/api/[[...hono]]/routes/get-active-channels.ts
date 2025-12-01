import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { channels } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

export function registerGetActiveChannels(app: Hono<AdminEnv>) {
    app.get("/active-channels", async (c) => {
        const { env } = getCloudflareContext();
        const db = createDatabase(env);
        const kv = env.LAFTER;
        if (!kv) {
            // KV バインディングが未設定の場合は処理を続行できないため、早期に丁寧なエラーを返します。
            return c.json(
                { message: "Workers KV LAFTER バインディングが設定されていません。" },
                500,
            );
        }

        const activeChannels = await db
            .select({
                channel_id: channels.id,
                channel_name: channels.name,
            })
            .from(channels)
            .where(eq(channels.status, 1));

        const serializedChannels = JSON.stringify(activeChannels);
        try {
            // 取得結果をそのまま KV に保存し、後続処理で再利用しやすいように丁寧に永続化いたします。
            await kv.put("active_channels", serializedChannels);
        } catch (error) {
            console.error("Workers KV への active_channels 保存に失敗しました。", error);
            return c.json(
                {
                    message: "Workers KV へアクティブチャンネル情報を書き込めませんでした。",
                },
                500,
            );
        }

        return c.json(activeChannels, 200);
    });
}
