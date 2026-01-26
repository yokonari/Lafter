import { type Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { eq, max } from "drizzle-orm";
import { createDatabase } from "../context";
import { styles } from "@/lib/schema";

// 芸風追加のバリデーションをまとめます。
const styleSchema = z.object({
  id: z
    .string()
    .min(2, "芸風IDは2文字以上で入力してください。")
    .max(50, "芸風IDは50文字以内で入力してください。")
    .regex(/^[a-z0-9-]+$/, "芸風IDは英小文字、数字、ハイフンのみ使用できます。"),
  name: z.string().min(1, "芸風名は必須です。").max(100, "芸風名は100文字以内で入力してください。"),
});

export function registerPostAdminStyle<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string
>(app: Hono<E, S, B>) {
  app.post("/admin/styles", async (c) => {
    const json = await c.req.json().catch(() => null);
    const parseResult = styleSchema.safeParse(json);

    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      return c.json(
        {
          message: firstError?.message ?? "入力データが正しくありません。",
          errors: parseResult.error.issues,
        },
        400
      );
    }

    const data = parseResult.data;
    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    try {
      const existing = await db
        .select({ id: styles.id })
        .from(styles)
        .where(eq(styles.id, data.id))
        .limit(1);
      if (existing.length > 0) {
        return c.json({ message: "この芸風IDは既に登録されています。" }, 400);
      }

      // 末尾へ追加するために displayOrder の最大値を取得します。
      const [orderRow] = await db
        .select({ maxOrder: max(styles.displayOrder) })
        .from(styles);
      const displayOrder = (orderRow?.maxOrder ?? 0) + 1;

      const insertResult = await db.insert(styles).values({
        id: data.id,
        name: data.name,
        displayOrder,
      }).returning({ id: styles.id, name: styles.name, displayOrder: styles.displayOrder });

      const style = insertResult[0];
      if (!style) {
        throw new Error("芸風の追加に失敗しました。");
      }

      return c.json(
        {
          success: true,
          style,
          message: "芸風を追加しました。",
        },
        201
      );
    } catch (error) {
      console.error("Create style error:", error);
      return c.json(
        {
          message: "芸風の追加中にエラーが発生しました。",
          error: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  });
}
