import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDatabase, type AppDatabase } from "@/app/api/[[...hono]]/context";

/**
 * Server ComponentまたはServer ActionからDBインスタンスを取得
 * OpenNext for Cloudflare環境でのみ動作します
 */
export function getDB(): AppDatabase {
  try {
    const { env } = getCloudflareContext();
    return createDatabase(env as CloudflareEnv);
  } catch {
    throw new Error("Failed to get Cloudflare context. This function must be called from a Server Component or Server Action in a deployed environment.");
  }
}
