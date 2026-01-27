import { type Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { createDatabase } from "../context";
import { artists, agencies, artistStyles, artistChannels, artistAliases } from "@/lib/schema";

export function registerGetAdminComedian<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string
>(app: Hono<E, S, B>) {
  app.get("/admin/comedian/:id", async (c) => {
    const idParam = c.req.param("id");
    const id = Number(idParam);

    if (!Number.isFinite(id) || id < 1) {
      return c.json({ message: "無効なIDです。" }, 400);
    }

    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    try {
      // 芸人基本情報を取得
      const artist = await db
        .select({
          id: artists.id,
          slug: artists.slug,
          name: artists.name,
          kana: artists.kana,
          startedOn: artists.startedOn,
          description: artists.description,
          agencyId: artists.agencyId,
          agencyName: agencies.name,
          createdAt: artists.createdAt,
          updatedAt: artists.updatedAt,
        })
        .from(artists)
        .innerJoin(agencies, eq(artists.agencyId, agencies.id))
        .where(eq(artists.id, id))
        .limit(1);

      if (artist.length === 0) {
        return c.json({ message: "芸人が見つかりません。" }, 404);
      }

      const comedianData = artist[0];

      // 芸風を取得
      const stylesResult = await db
        .select({ styleId: artistStyles.styleId })
        .from(artistStyles)
        .where(eq(artistStyles.artistId, id));

      // チャンネル情報を取得
      const channelsResult = await db
        .select({
          channelId: artistChannels.channelId,
          role: artistChannels.role,
          description: artistChannels.description,
          displayOrder: artistChannels.displayOrder,
        })
        .from(artistChannels)
        .where(eq(artistChannels.artistId, id))
        .orderBy(artistChannels.displayOrder);

      // 別名を取得
      const aliasesResult = await db
        .select({
          name: artistAliases.name,
          kana: artistAliases.kana,
        })
        .from(artistAliases)
        .where(eq(artistAliases.artistId, id));

      return c.json({
        comedian: {
          ...comedianData,
          styles: stylesResult.map((s) => s.styleId),
          channels: channelsResult.map((ch) => ({
            channelId: ch.channelId,
            role: ch.role,
            description: ch.description || undefined,
          })),
          aliases: aliasesResult.map((a) => ({
            name: a.name,
            kana: a.kana || undefined,
          })),
        },
      });
    } catch (error) {
      console.error("Get comedian error:", error);
      return c.json(
        {
          message: "芸人情報の取得中にエラーが発生しました。",
        },
        500
      );
    }
  });
}
