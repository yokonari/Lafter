import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, asc, desc, eq, like } from "drizzle-orm";
import { channels } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

const LIMIT = 10;

export function registerGetAdminChannels(app: Hono<AdminEnv>) {
  app.get("/admin/channels", async (c) => {
    const rawPage = c.req.query("page");
    const parsedPage = rawPage ? Number(rawPage) : 1;
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;

    const rawKeyword = c.req.query("q") ?? "";
    const keyword = rawKeyword.trim();

    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const whereExpression = keyword
      ? and(eq(channels.status, 0), like(channels.name, `%${keyword}%`))
      : eq(channels.status, 0);

    const baseQuery = db
      .select({
        id: channels.id,
        name: channels.name,
        status: channels.status,
        keyword: channels.keyword,
      })
      .from(channels)
      .where(whereExpression);

    const rows = await baseQuery
      .orderBy(keyword ? asc(channels.name) : desc(channels.createdAt))
      .limit(LIMIT)
      .offset((page - 1) * LIMIT);

    const hasNext = rows.length === LIMIT;

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
          limit: LIMIT,
          hasNext,
        },
        200,
      );
  });
}
