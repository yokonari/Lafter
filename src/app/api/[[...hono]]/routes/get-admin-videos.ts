import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { desc, eq, and, like } from "drizzle-orm";
import { channels, videos } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

const MAX_LIMIT = 10;

export function registerGetAdminVideos(app: Hono<AdminEnv>) {
  app.get("/admin/videos", async (c) => {
    const rawPage = c.req.query("page");
    const parsedPage = rawPage ? Number(rawPage) : 1;
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;

    const rawKeyword = c.req.query("q") ?? "";
    const keyword = rawKeyword.trim();

    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const baseCondition = and(eq(videos.status, 0), eq(channels.status, 1));
    const whereExpression = keyword
      ? and(baseCondition, like(videos.title, `%${keyword}%`))
      : baseCondition;

    const rows = await db
      .select({
        id: videos.id,
        title: videos.title,
        channelName: channels.name,
      })
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(whereExpression)
      .orderBy(desc(videos.createdAt))
      .limit(MAX_LIMIT)
      .offset((page - 1) * MAX_LIMIT);

    const hasNext = rows.length === MAX_LIMIT;

    const payload = rows.map((row) => ({
      id: row.id,
      url: `https://www.youtube.com/watch?v=${row.id}`,
      title: row.title,
      channel_name: row.channelName ?? "",
    }));

    // 管理画面向けに整形した一覧データを丁寧にお返しいたします。
    return c.json(
      {
        videos: payload,
        page,
        limit: MAX_LIMIT,
        hasNext,
      },
      200,
    );
  });
}
