import { getAuth } from "@/lib/admin-auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Session, User } from "better-auth/types";
// 認証情報を扱う型を better-auth/types から丁寧に参照します。
import { createMiddleware } from "hono/factory";

export const authMiddleware = createMiddleware<{
  Variables: {
    session: Session;
    user: User;
  };
}>(async (c, next) => {
  try {
    // 認証情報を丁寧に検証し、後続処理が安全に利用できるよう共有します。
    const { env } = getCloudflareContext();
    const auth = getAuth(env.DB);

    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({}, 401);
    }

    c.set("session", session.session);
    c.set("user", session.user);
    await next();
  } catch {
    return c.json({}, 500);
  }
});
