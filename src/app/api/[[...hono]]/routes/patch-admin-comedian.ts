import { type Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createDatabase } from "../context";
import { ArtistRepository } from "@/lib/repositories/artistRepository";
import { agencies, styles, artists } from "@/lib/schema";

// バリデーションスキーマ（全フィールドオプション）
const updateComedianSchema = z.object({
  name: z.string().min(1, "芸人名は必須です。").max(100, "芸人名は100文字以内で入力してください。").optional(),
  slug: z
    .string()
    .min(2, "スラッグは2文字以上である必要があります。")
    .max(50, "スラッグは50文字以内で入力してください。")
    .regex(/^[a-z0-9-]+$/, "スラッグは英小文字、数字、ハイフンのみ使用できます。")
    .optional(),
  kana: z.string().max(100, "読み仮名は100文字以内で入力してください。").optional(),
  startedOn: z
    .string()
    .regex(/^\d{4}$/, "活動開始年は4桁の年形式で入力してください（例: 2003）")
    .optional(),
  agencyId: z.string().min(1, "事務所は必須です。").optional(),
  styles: z
    .array(z.string())
    .max(5, "芸風は最大5つまで選択できます。")
    .optional(),
  channels: z
    .array(
      z.object({
        channelId: z.string().min(1, "チャンネルIDは必須です。"),
        role: z.enum(["official", "group"]),
        description: z.string().max(200, "説明は200文字以内で入力してください。").optional(),
      })
    )
    .optional(),
  description: z.string().max(500, "説明は500文字以内で入力してください。").optional(),
});

export function registerPatchAdminComedian<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string
>(app: Hono<E, S, B>) {
  app.patch("/admin/comedian/:id", async (c) => {
    // IDパラメータを取得
    const idParam = c.req.param("id");
    const id = Number(idParam);

    if (!Number.isFinite(id) || id < 1) {
      return c.json({ message: "無効なIDです。" }, 400);
    }

    // リクエストボディのバリデーション
    const json = await c.req.json().catch(() => null);
    const parseResult = updateComedianSchema.safeParse(json);

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
    const artistRepository = new ArtistRepository(db);

    try {
      // 芸人の存在チェック
      const existingArtist = await db
        .select({ id: artists.id })
        .from(artists)
        .where(eq(artists.id, id))
        .limit(1);

      if (existingArtist.length === 0) {
        return c.json(
          { message: "指定された芸人が見つかりません。" },
          404
        );
      }

      // スラッグの一意性チェック（変更する場合のみ）
      if (data.slug) {
        const isUnique = await artistRepository.isSlugUnique(data.slug, id);
        if (!isUnique) {
          return c.json(
            { message: "このスラッグは既に使用されています。別のスラッグを入力してください。" },
            400
          );
        }
      }

      // 事務所の存在チェック（変更する場合のみ）
      if (data.agencyId) {
        const agency = await db
          .select({ id: agencies.id })
          .from(agencies)
          .where(eq(agencies.id, data.agencyId))
          .limit(1);

        if (agency.length === 0) {
          return c.json(
            { message: "指定された事務所が見つかりません。" },
            400
          );
        }
      }

      // 芸風の存在チェック（変更する場合のみ）
      if (data.styles && data.styles.length > 0) {
        const styleResults = await db
          .select({ id: styles.id })
          .from(styles);

        const validStyleIds = new Set(styleResults.map((s) => s.id));
        const invalidStyles = data.styles.filter((s) => !validStyleIds.has(s));

        if (invalidStyles.length > 0) {
          return c.json(
            {
              message: `無効な芸風IDが含まれています: ${invalidStyles.join(", ")}`,
            },
            400
          );
        }
      }

      // 芸人を更新
      await artistRepository.update(id, {
        name: data.name,
        slug: data.slug,
        kana: data.kana,
        startedOn: data.startedOn,
        agencyId: data.agencyId,
        styles: data.styles,
        channels: data.channels,
        description: data.description,
      });

      return c.json({
        success: true,
        id,
        message: "芸人を更新しました。",
      });
    } catch (error) {
      console.error("Update comedian error:", error);
      return c.json(
        {
          message: "芸人の更新中にエラーが発生しました。",
          error: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  });
}
