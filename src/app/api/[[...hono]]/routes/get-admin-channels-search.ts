import { type Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { like, eq, and, or } from "drizzle-orm";
import { channels } from "@/lib/schema";
import { createDatabase } from "../context";

export function registerGetAdminChannelsSearch<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string
>(app: Hono<E, S, B>) {
  app.get("/admin/channels/search", async (c) => {
    // クエリパラメータを取得
    const q = c.req.query("q");
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Number(limitParam) : 20;

    // キーワードが必須
    if (!q || q.trim().length === 0) {
      return c.json(
        { message: "検索キーワード(q)は必須です。" },
        400
      );
    }

    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    try {
      // チャンネル名の部分一致、またはID一致で検索（status=1の登録済みのみ）
      const searchTerm = `%${q.trim()}%`;
      const results = await db
        .select({
          id: channels.id,
          name: channels.name,
          url: channels.id, // URLはYouTubeチャンネルIDから生成可能
        })
        .from(channels)
        .where(
          and(
            or(
              like(channels.name, searchTerm),
              eq(channels.id, q.trim()),
            ),
            eq(channels.status, 1) // 登録済みのみ
          )
        )
        .limit(Math.min(limit, 50)) // 最大50件
        .orderBy(channels.name);

      // URLを生成
      const channelsWithUrl = results.map((channel) => ({
        id: channel.id,
        name: channel.name,
        url: `https://www.youtube.com/channel/${channel.id}`,
      }));

      return c.json({
        channels: channelsWithUrl,
      });
    } catch (error) {
      console.error("Channel search error:", error);
      return c.json(
        {
          message: "チャンネル検索中にエラーが発生しました。",
        },
        500
      );
    }
  });
}
