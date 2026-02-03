import { type Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createDatabase } from "../context";
import { styles } from "@/lib/schema";

// 芸風更新のバリデーションをまとめます。
const updateStyleSchema = z.object({
  name: z.string().min(1, "芸風名は必須です。").max(100, "芸風名は100文字以内で入力してください。").optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "色はHEX形式（#RRGGBB）で入力してください。").nullable().optional(),
  displayOrder: z.number().int().min(0).optional(),
});

export function registerPatchAdminStyle<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string
>(app: Hono<E, S, B>) {
  app.patch("/admin/styles/:id", async (c) => {
    const styleId = c.req.param("id");
    if (!styleId) {
      return c.json({ message: "芸風IDが指定されていません。" }, 400);
    }

    const json = await c.req.json().catch(() => null);
    const parseResult = updateStyleSchema.safeParse(json);

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
      // 芸風の存在確認
      const existing = await db
        .select({ id: styles.id })
        .from(styles)
        .where(eq(styles.id, styleId))
        .limit(1);
      if (existing.length === 0) {
        return c.json({ message: "指定された芸風が見つかりません。" }, 404);
      }

      // 更新するフィールドをまとめます。
      const updateFields: {
        name?: string;
        color?: string | null;
        displayOrder?: number;
      } = {};

      if (data.name !== undefined) {
        updateFields.name = data.name;
      }
      if (data.color !== undefined) {
        updateFields.color = data.color;
      }
      if (data.displayOrder !== undefined) {
        updateFields.displayOrder = data.displayOrder;
      }

      if (Object.keys(updateFields).length === 0) {
        return c.json({ message: "更新する項目がありません。" }, 400);
      }

      const updateResult = await db
        .update(styles)
        .set(updateFields)
        .where(eq(styles.id, styleId))
        .returning({
          id: styles.id,
          name: styles.name,
          color: styles.color,
          displayOrder: styles.displayOrder,
        });

      const style = updateResult[0];
      if (!style) {
        throw new Error("芸風の更新に失敗しました。");
      }

      return c.json({
        success: true,
        style,
        message: "芸風を更新しました。",
      });
    } catch (error) {
      console.error("Update style error:", error);
      return c.json(
        {
          message: "芸風の更新中にエラーが発生しました。",
          error: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  });
}
