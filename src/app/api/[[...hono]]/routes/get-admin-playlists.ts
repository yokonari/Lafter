import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, desc, eq } from "drizzle-orm";
import { channels, playlists } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

const MAX_LIMIT = 10;

export function registerGetAdminPlaylists(app: Hono<AdminEnv>) {
  app.get("/admin/play_lists", async (c) => {
    const rawPage = c.req.query("page");
    const parsedPage = rawPage ? Number(rawPage) : 1;
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;

    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const rows = await db
      .select({
        id: playlists.id,
        name: playlists.name,
        status: playlists.status,
        channelName: channels.name,
      })
      .from(playlists)
      .innerJoin(channels, eq(playlists.channelId, channels.id))
      .where(
        and(
          eq(playlists.status, 0),
          eq(channels.status, 1),
        ),
      )
      .orderBy(desc(playlists.createdAt))
      .limit(MAX_LIMIT)
      .offset((page - 1) * MAX_LIMIT);

    const hasNext = rows.length === MAX_LIMIT;

    const payload = rows.map((row) => ({
      id: row.id,
      url: `https://www.youtube.com/playlist?list=${row.id}`,
      title: row.name,
      status: row.status ?? 0,
      channel_name: row.channelName ?? "",
    }));

    // 管理画面向けプレイリスト一覧を丁寧にご提供いたします。
    return c.json(
      {
        play_lists: payload,
        page,
        limit: MAX_LIMIT,
        hasNext,
      },
      200,
    );
  });
}
