import { type Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sql, desc } from "drizzle-orm";
import { createDatabase } from "../context";
import { agencies, artists } from "@/lib/schema";

export function registerGetAdminAgencies<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string
>(app: Hono<E, S, B>) {
  app.get("/admin/agencies", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    try {
      // 芸人数が多い順にソートします。
      const results = await db
        .select({
          id: agencies.id,
          name: agencies.name,
          displayOrder: agencies.displayOrder,
          comedianCount: sql<number>`count(${artists.id})`.as("comedian_count"),
        })
        .from(agencies)
        .leftJoin(artists, sql`${agencies.id} = ${artists.agencyId}`)
        .groupBy(agencies.id)
        .orderBy(desc(sql`comedian_count`));

      return c.json({
        agencies: results,
      });
    } catch (error) {
      console.error("Get agencies error:", error);
      return c.json(
        {
          message: "事務所一覧の取得中にエラーが発生しました。",
        },
        500
      );
    }
  });
}
