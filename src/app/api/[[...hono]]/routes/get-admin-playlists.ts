import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { desc, eq } from "drizzle-orm";
import { playlists } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

const MAX_LIMIT = 50;

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
      })
      .from(playlists)
      .where(eq(playlists.status, 0))
      .orderBy(desc(playlists.createdAt))
      .limit(MAX_LIMIT)
      .offset((page - 1) * MAX_LIMIT);

    const payload = rows.map((row) => ({
      id: row.id,
      url: `https://www.youtube.com/playlist?list=${row.id}`,
      title: row.name,
    }));

    // 管理画面向けプレイリスト一覧を丁寧にご提供いたします。
    return c.json(
      {
        play_lists: payload,
        page,
      },
      200,
    );
  });
}
