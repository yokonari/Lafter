import { type Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq, sql } from "drizzle-orm";
import { createDatabase } from "../context";
import { agencyChannels, channels } from "@/lib/schema";

export function registerGetAdminAgencyChannels<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string
>(app: Hono<E, S, B>) {
  app.get("/admin/agency-channels", async (c) => {
    const agencyId = c.req.query("agencyId")?.trim() ?? "";
    if (!agencyId) {
      return c.json({ message: "agencyId を指定してください。" }, 400);
    }

    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    try {
      // 事務所に紐づくチャンネル一覧を取得し、表示名を補完します。
      const results = await db
        .select({
          channelId: agencyChannels.channelId,
          channelName: sql<string>`coalesce(${channels.name}, ${agencyChannels.name}, ${agencyChannels.channelId})`,
        })
        .from(agencyChannels)
        .leftJoin(channels, eq(agencyChannels.channelId, channels.id))
        .where(eq(agencyChannels.agencyId, agencyId))
        .orderBy(agencyChannels.id);

      return c.json({
        channels: results.map((row) => ({
          channelId: row.channelId,
          name: row.channelName,
        })),
      });
    } catch (error) {
      console.error("Get agency channels error:", error);
      return c.json(
        { message: "事務所チャンネルの取得中にエラーが発生しました。" },
        500
      );
    }
  });
}
