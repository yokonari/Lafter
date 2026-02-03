import { type Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq, sql } from "drizzle-orm";
import { createDatabase } from "../context";
import { styles, artistStyles } from "@/lib/schema";

export function registerDeleteAdminStyle<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string
>(app: Hono<E, S, B>) {
  app.delete("/admin/styles/:id", async (c) => {
    const styleId = c.req.param("id");
    if (!styleId) {
      return c.json({ message: "芸風IDが指定されていません。" }, 400);
    }

    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    try {
      // 芸風の存在確認
      const existing = await db
        .select({ id: styles.id })
        .from(styles)
        .where(eq(styles.id, styleId))
        .limit(1);
      if (existing.length === 0) {
        return c.json({ message: "指定された芸風が見つかりません。" }, 404);
      }

      // この芸風を使用している芸人数を確認
      const [usageCount] = await db
        .select({ count: sql<number>`count(*)`.as("count") })
        .from(artistStyles)
        .where(eq(artistStyles.styleId, styleId));

      if (usageCount && usageCount.count > 0) {
        return c.json(
          {
            message: `この芸風は ${usageCount.count} 件の芸人に紐付けられています。先に芸人の芸風設定を変更してください。`,
          },
          400
        );
      }

      // 芸風を削除
      await db.delete(styles).where(eq(styles.id, styleId));

      return c.json({
        success: true,
        message: "芸風を削除しました。",
      });
    } catch (error) {
      console.error("Delete style error:", error);
      return c.json(
        {
          message: "芸風の削除中にエラーが発生しました。",
          error: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  });
}
