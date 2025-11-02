import { videos } from "@/lib/schema";
import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Cloudflare 環境の DB バインディングを型として明示させていただきます。
declare global {
  interface CloudflareEnv {
    DB: D1Database;
  }
}

const app = new Hono().basePath("/api");

app.get("/videos", async (c) => {
  const { env } = getCloudflareContext();
  // 型定義済みの env から安全に DB インスタンスを取得いたします。
  const db = drizzle(env.DB);
  const filesResponse = await db.select().from(videos);
  return c.json(filesResponse);
});

export const GET = handle(app);
