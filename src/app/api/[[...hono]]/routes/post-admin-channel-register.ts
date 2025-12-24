import { type Hono, type Context } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { channels } from "@/lib/schema";
import { createDatabase, type AppDatabase } from "../context";
import { z } from "zod";

type TransactionClient = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
type DatabaseClient = AppDatabase | TransactionClient;

const YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3/channels";

// バッチ処理のサイズ定数（YouTube API の推奨上限は 50 です）
const BATCH_SIZE = 50;

const registerSchema = z.object({
    channelIds: z.array(z.string().min(1)),
});

export function registerPostAdminChannelRegister<
    E extends import("hono").Env,
    S extends import("hono").Schema,
    B extends string
>(app: Hono<E, S, B>) {
    app.post("/admin/channels/register", async (c) => {
        // リクエストボディのバリデーションを丁寧に行います。
        const json = await c.req.json().catch(() => null);
        const parseResult = registerSchema.safeParse(json);
        if (!parseResult.success) {
            return c.json(
                { message: "リクエスト形式が正しくありません。channelIds (配列) を指定してください。" },
                400
            );
        }
        const { channelIds } = parseResult.data;

        // 重複などを排除してクリーンなリストを作ります。
        const uniqueIds = Array.from(new Set(channelIds.map((id) => id.trim()).filter((id) => id)));
        if (uniqueIds.length === 0) {
            return c.json({ message: "有効なチャンネルIDが指定されていません。" }, 400);
        }

        const { env } = getCloudflareContext();
        const apiKey = env.YOUTUBE_API_KEY ?? process.env.YOUTUBE_API_KEY ?? "";
        if (!apiKey) {
            return c.json({ message: "YouTube API キーが設定されていません。" }, 500);
        }

        const db = createDatabase(env);
        const results: { id: string; name: string; success: boolean; error?: string }[] = [];

        // IDリストをバッチサイズごとに分割して処理します。
        for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
            const batchIds = uniqueIds.slice(i, i + BATCH_SIZE);
            try {
                await processBatch(db, apiKey, batchIds, results);
            } catch (error) {
                console.error("Batch processing error:", error);
                // バッチ単位のエラーも個別のエラーとして記録し、可能な限り処理を継続します。
                for (const id of batchIds) {
                    if (!results.find((r) => r.id === id)) {
                        results.push({
                            id,
                            name: "",
                            success: false,
                            error: (error as Error).message ?? "一括処理中にエラーが発生しました。",
                        });
                    }
                }
            }
        }

        const successCount = results.filter((r) => r.success).length;
        const message = `${successCount} 件のチャンネルを登録しました。`;

        return c.json({ message, results }, 200);
    });
}

async function processBatch(
    db: AppDatabase,
    apiKey: string,
    channelIds: string[],
    results: { id: string; name: string; success: boolean; error?: string }[]
) {
    // YouTube Data API からチャンネル情報を一括取得します。
    const url = new URL(YOUTUBE_API_BASE_URL);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("id", channelIds.join(","));
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`YouTube API Error: ${response.status}`);
    }

    const data = (await response.json()) as {
        items?: Array<{ id: string; snippet: { title: string } }>;
    };
    const items = data.items ?? [];

    // 取得できたチャンネルをマップ化して高速に照合できるようにします。
    const foundChannels = new Map<string, { title: string }>();
    for (const item of items) {
        foundChannels.set(item.id, { title: item.snippet.title });
    }

    // 各IDについてDB更新を行います。
    for (const id of channelIds) {
        const info = foundChannels.get(id);
        if (!info) {
            results.push({
                id,
                name: "",
                success: false,
                error: "YouTube上でチャンネルが見つかりませんでした。",
            });
            continue;
        }

        try {
            await registerChannel(db, id, info.title);
            results.push({
                id,
                name: info.title,
                success: true,
            });
        } catch (error) {
            results.push({
                id,
                name: info.title,
                success: false,
                error: (error as Error).message ?? "DB保存に失敗しました。",
            });
        }
    }
}

async function registerChannel(db: DatabaseClient, id: string, name: string) {
    // 既存レコードを確認します。
    const existing = await db
        .select()
        .from(channels)
        .where(eq(channels.id, id))
        .limit(1);

    if (existing.length > 0) {
        // 既に存在する場合はステータスを1（登録済み）に更新し、名前も最新化します。
        await db
            .update(channels)
            .set({
                name: name,
                status: 1,
            })
            .where(eq(channels.id, id));
    } else {
        // 新規作成します。
        await db.insert(channels).values({
            id,
            name,
            status: 1,
        });
    }
}
