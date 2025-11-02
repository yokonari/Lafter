import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { desc, eq } from "drizzle-orm";
import { channels, videos } from "@/lib/schema";
import { createDatabase } from "../context";

const MAX_LIMIT = 50;

export function registerGetAdminVideos(app: Hono) {
  app.get("/admin/videos", async (c) => {
    const rawPage = c.req.query("page");
    const parsedPage = rawPage ? Number(rawPage) : 1;
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;

    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const rows = await db
      .select({
        id: videos.id,
        title: videos.title,
        channelName: channels.name,
        channelStatus: channels.status,
      })
      .from(videos)
      .leftJoin(channels, eq(videos.channelId, channels.id))
      .where(eq(videos.status, 0))
      .orderBy(desc(videos.createdAt))
      .limit(MAX_LIMIT)
      .offset((page - 1) * MAX_LIMIT);

    const payload = rows.map((row) => ({
      id: row.id,
      url: `https://www.youtube.com/watch?v=${row.id}`,
      title: row.title,
      channel_name: row.channelName ?? "",
      is_registered_channel: typeof row.channelStatus === "number" ? row.channelStatus : 0,
    }));

    // 管理画面向けに整形した一覧データを丁寧にお返しいたします。
    return c.json(
      {
        videos: payload,
        page,
      },
      200,
    );
  });
}
