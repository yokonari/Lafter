import { type Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { eq, max } from "drizzle-orm";
import { createDatabase } from "../context";
import { agencies } from "@/lib/schema";

// 事務所追加のバリデーションをまとめます。
const agencySchema = z.object({
  id: z
    .string()
    .min(2, "事務所IDは2文字以上で入力してください。")
    .max(50, "事務所IDは50文字以内で入力してください。")
    .regex(/^[a-z0-9-]+$/, "事務所IDは英小文字、数字、ハイフンのみ使用できます。"),
  name: z.string().min(1, "事務所名は必須です。").max(100, "事務所名は100文字以内で入力してください。"),
});

export function registerPostAdminAgency<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string
>(app: Hono<E, S, B>) {
  app.post("/admin/agencies", async (c) => {
    const json = await c.req.json().catch(() => null);
    const parseResult = agencySchema.safeParse(json);

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
        .select({ id: agencies.id })
        .from(agencies)
        .where(eq(agencies.id, data.id))
        .limit(1);
      if (existing.length > 0) {
        return c.json(
          { message: "この事務所IDは既に登録されています。" },
          400
        );
      }

      // 末尾へ追加するために displayOrder の最大値を取得します。
      const [orderRow] = await db
        .select({ maxOrder: max(agencies.displayOrder) })
        .from(agencies);
      const displayOrder = (orderRow?.maxOrder ?? 0) + 1;

      const insertResult = await db.insert(agencies).values({
        id: data.id,
        name: data.name,
        displayOrder,
      }).returning({ id: agencies.id, name: agencies.name, displayOrder: agencies.displayOrder });

      const agency = insertResult[0];
      if (!agency) {
        throw new Error("事務所の追加に失敗しました。");
      }

      return c.json(
        {
          success: true,
          agency,
          message: "事務所を追加しました。",
        },
        201
      );
    } catch (error) {
      console.error("Create agency error:", error);
      return c.json(
        {
          message: "事務所の追加中にエラーが発生しました。",
          error: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  });
}
