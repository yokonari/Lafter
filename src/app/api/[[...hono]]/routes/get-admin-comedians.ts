import { type Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDatabase } from "../context";
import { ArtistRepository } from "@/lib/repositories/artistRepository";

export function registerGetAdminComedians<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string
>(app: Hono<E, S, B>) {
  app.get("/admin/comedians", async (c) => {
    // クエリパラメータを取得
    const pageParam = c.req.query("page");
    const limitParam = c.req.query("limit");
    const keyword = c.req.query("q");
    const agencyId = c.req.query("agency_id");
    const styleId = c.req.query("style_id");

    const page = pageParam ? Number(pageParam) : 1;
    const limit = limitParam ? Number(limitParam) : 50;

    // パラメータバリデーション
    if (!Number.isFinite(page) || page < 1) {
      return c.json({ message: "pageは1以上の整数である必要があります。" }, 400);
    }

    if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
      return c.json({ message: "limitは1〜100の整数である必要があります。" }, 400);
    }

    const { env } = getCloudflareContext();
    const db = createDatabase(env);
    const artistRepository = new ArtistRepository(db);

    try {
      const result = await artistRepository.getAdminList({
        page,
        limit,
        keyword: keyword || undefined,
        agencyId: agencyId || undefined,
        styleId: styleId || undefined,
      });

      return c.json({
        comedians: result.items,
        page,
        limit,
        hasNext: result.hasNext,
        totalCount: result.total,
      });
    } catch (error) {
      console.error("Get comedians error:", error);
      return c.json(
        {
          message: "芸人一覧の取得中にエラーが発生しました。",
        },
        500
      );
    }
  });
}
