import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";

// Cloudflare 環境の DB バインディングを型として明示させていただきます。
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    YOUTUBE_API_KEY?: string;
    LAFTER: KVNamespace;
  }
}

export type AppDatabase = ReturnType<typeof drizzle>;

export function createDatabase(env: CloudflareEnv): AppDatabase {
  // 型定義済みの env から丁寧に Drizzle インスタンスを生成いたします。
  return drizzle(env.DB);
}

export {};
