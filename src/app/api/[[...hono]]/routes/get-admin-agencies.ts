import { type Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDatabase } from "../context";
import { agencies } from "@/lib/schema";

export function registerGetAdminAgencies<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string
>(app: Hono<E, S, B>) {
  app.get("/admin/agencies", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    try {
      const results = await db
        .select({
          id: agencies.id,
          name: agencies.name,
          displayOrder: agencies.displayOrder,
        })
        .from(agencies)
        .orderBy(agencies.displayOrder);

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
