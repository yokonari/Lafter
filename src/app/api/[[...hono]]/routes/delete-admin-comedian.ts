import { type Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { createDatabase } from "../context";
import { ArtistRepository } from "@/lib/repositories/artistRepository";
import { artists } from "@/lib/schema";

export function registerDeleteAdminComedian<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string
>(app: Hono<E, S, B>) {
  app.delete("/admin/comedian/:id", async (c) => {
    // IDパラメータを取得
    const idParam = c.req.param("id");
    const id = Number(idParam);

    if (!Number.isFinite(id) || id < 1) {
      return c.json({ message: "無効なIDです。" }, 400);
    }

    const { env } = getCloudflareContext();
    const db = createDatabase(env);
    const artistRepository = new ArtistRepository(db);

    try {
      // 芸人の存在チェック
      const existingArtist = await db
        .select({ id: artists.id, name: artists.name })
        .from(artists)
        .where(eq(artists.id, id))
        .limit(1);

      if (existingArtist.length === 0) {
        return c.json(
          { message: "指定された芸人が見つかりません。" },
          404
        );
      }

      // 芸人を削除（カスケード削除により関連データも自動削除）
      await artistRepository.delete(id);

      return c.json({
        success: true,
        deleted: id,
        message: `${existingArtist[0]?.name}を削除しました。`,
      });
    } catch (error) {
      console.error("Delete comedian error:", error);
      return c.json(
        {
          message: "芸人の削除中にエラーが発生しました。",
          error: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  });
}
