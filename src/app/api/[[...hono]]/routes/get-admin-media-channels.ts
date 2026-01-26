import { type Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq, sql } from "drizzle-orm";
import { createDatabase } from "../context";
import { channels, mediaChannels } from "@/lib/schema";

export function registerGetAdminMediaChannels<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string
>(app: Hono<E, S, B>) {
  app.get("/admin/media-channels", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    try {
      // メディアチャンネル一覧を取得し、表示名を補完します。
      const results = await db
        .select({
          channelId: mediaChannels.channelId,
          channelName: sql<string>`coalesce(${channels.name}, ${mediaChannels.name}, ${mediaChannels.channelId})`,
          displayOrder: mediaChannels.displayOrder,
        })
        .from(mediaChannels)
        .leftJoin(channels, eq(mediaChannels.channelId, channels.id))
        .orderBy(mediaChannels.displayOrder);

      return c.json({
        channels: results.map((row) => ({
          channelId: row.channelId,
          name: row.channelName,
          displayOrder: row.displayOrder,
        })),
      });
    } catch (error) {
      console.error("Get media channels error:", error);
      return c.json(
        { message: "メディアチャンネルの取得中にエラーが発生しました。" },
        500
      );
    }
  });
}
