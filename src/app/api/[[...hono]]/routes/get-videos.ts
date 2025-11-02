import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { videos } from "@/lib/schema";
import { createDatabase } from "../context";

export function registerGetVideos(app: Hono) {
  app.get("/videos", async (c) => {
    const { env } = getCloudflareContext();
    // 型定義済みの env から安全に DB インスタンスを取得いたします。
    const db = createDatabase(env);
    const filesResponse = await db.select().from(videos);
    return c.json(filesResponse);
  });
}
