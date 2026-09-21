import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { searchLogs } from "@/lib/schema";
import { parseLimitedJson, protectPublicPost } from "@/lib/public-api-security";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

type SearchLogsRequest = {
    keyword?: unknown;
};

const MAX_BODY_BYTES = 1_024;
const MAX_KEYWORD_LENGTH = 100;

export function registerPostSearchLogs(app: Hono<AdminEnv>) {
    app.post("/search-logs", async (c) => {
        const { env } = getCloudflareContext();
        const db = createDatabase(env);

        const securityResponse = await protectPublicPost(c.req.raw, env.LAFTER, {
            namespace: "search-log",
            limit: 120,
            windowSeconds: 60 * 60,
            maxBodyBytes: MAX_BODY_BYTES,
        });
        if (securityResponse) return securityResponse;

        const fail = (message: string, status: ContentfulStatusCode = 400) => c.json({ message }, status);

        const parsedBody = await parseLimitedJson<SearchLogsRequest>(c.req.raw, MAX_BODY_BYTES);
        if (!parsedBody.ok) return parsedBody.response;
        const body = parsedBody.value;

        const { keyword } = body;

        if (typeof keyword !== "string" || !keyword.trim()) {
            return fail("キーワードは必須です。", 400);
        }

        const normalizedKeyword = keyword.normalize("NFC").trim();
        if (normalizedKeyword.length > MAX_KEYWORD_LENGTH) {
            return fail(`キーワードは${MAX_KEYWORD_LENGTH}文字以内で入力してください。`, 400);
        }

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
