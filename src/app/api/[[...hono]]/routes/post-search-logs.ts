import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { searchLogs } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

type SearchLogsRequest = {
    keyword: string;
};

export function registerPostSearchLogs(app: Hono<AdminEnv>) {
    app.post("/search-logs", async (c) => {
        const { env } = getCloudflareContext();
        const db = createDatabase(env);

        const fail = (message: string, status: ContentfulStatusCode = 400) => c.json({ message }, status);

        let body: SearchLogsRequest;
        try {
            body = (await c.req.json()) as SearchLogsRequest;
        } catch {
            return fail("リクエスト本文を JSON として解釈できませんでした。", 400);
        }

        const { keyword } = body;

        if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
            return fail("キーワードは必須です。", 400);
        }

        const normalizedKeyword = keyword.trim();

        try {
            const existingLogs = await db
                .select()
                .from(searchLogs)
                .where(eq(searchLogs.keyword, normalizedKeyword))
                .limit(1);

            if (existingLogs.length > 0) {
                await db
                    .update(searchLogs)
                    .set({ count: existingLogs[0].count + 1 })
                    .where(eq(searchLogs.id, existingLogs[0].id));
            } else {
                await db.insert(searchLogs).values({
                    keyword: normalizedKeyword,
                });
            }

            return c.json({ message: "検索ログを保存しました。" }, 200);
        } catch (error) {
            console.error("Failed to save search log:", error);
            return fail("検索ログの保存に失敗しました。", 500);
        }
    });
}
