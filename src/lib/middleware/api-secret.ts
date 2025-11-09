import { createMiddleware } from "hono/factory";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { verifyApiSecret } from "@/lib/api-secret";
import type { AdminEnv } from "@/app/api/[[...hono]]/types";

const PUBLIC_PATHS = new Set(["/videos", "/api/videos"]);

// API_SECRET を丁寧に検証し、公開 API(GET /api/videos) 以外への不正アクセスを防ぎます。
export const apiSecretMiddleware = createMiddleware<AdminEnv>(async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === "OPTIONS") {
    await next();
    return;
  }

  const path = c.req.path;
  if (method === "GET" && PUBLIC_PATHS.has(path)) {
    await next();
    return;
  }

  const session = c.get("session");
  if (session) {
    await next();
    return;
  }

  const { env } = getCloudflareContext();
  const secretResult = verifyApiSecret(c.req.raw.headers, env);
  if (!secretResult.ok) {
    return c.json({ message: secretResult.message }, secretResult.status);
  }

  await next();
});
