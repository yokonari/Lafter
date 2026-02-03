import { type Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDatabase } from "../context";
import { styles } from "@/lib/schema";

export function registerGetAdminStyles<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string
>(app: Hono<E, S, B>) {
  app.get("/admin/styles", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    try {
      const results = await db
        .select({
          id: styles.id,
          name: styles.name,
          color: styles.color,
          displayOrder: styles.displayOrder,
        })
        .from(styles)
        .orderBy(styles.displayOrder);

      return c.json({ styles: results });
    } catch (error) {
      console.error("Get styles error:", error);
      return c.json(
        { message: "芸風一覧の取得中にエラーが発生しました。" },
        500
      );
    }
  });
}
