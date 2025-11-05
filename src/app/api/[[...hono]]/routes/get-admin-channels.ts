import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { desc, eq } from "drizzle-orm";
import { channels } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

const MAX_LIMIT = 50;

export function registerGetAdminChannels(app: Hono<AdminEnv>) {
  app.get("/admin/channels", async (c) => {
    const rawPage = c.req.query("page");
    const parsedPage = rawPage ? Number(rawPage) : 1;
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;

    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const rows = await db
      .select({
        id: channels.id,
        name: channels.name,
        status: channels.status,
        keyword: channels.keyword,
      })
      .from(channels)
      .where(eq(channels.status, 0))
      .orderBy(desc(channels.createdAt))
      .limit(MAX_LIMIT)
      .offset((page - 1) * MAX_LIMIT);

    const payload = rows.map((row) => ({
      id: row.id,
      url: `https://www.youtube.com/channel/${row.id}`,
      name: row.name,
      status: row.status ?? 0,
      keyword: row.keyword ?? "",
    }));

    // 管理画面向けチャンネル一覧を丁寧にご提供いたします。
    return c.json(
      {
        channels: payload,
        page,
      },
      200,
    );
  });
}
