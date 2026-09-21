import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAuth } from "@/lib/admin-auth";
import { parseLimitedJson, protectPublicPost } from "@/lib/public-api-security";

const MAX_AUTH_BODY_BYTES = 2_048;

const handler = async (request: Request) => {
  const pathname = new URL(request.url).pathname;

  // 管理者作成は共有シークレット必須の専用ルートだけに限定します。
  if (pathname.endsWith("/sign-up/email")) {
    return Response.json({ message: "登録できません。" }, { status: 403 });
  }

  // Cloudflare D1 を利用した認証エンドポイントを丁寧にハンドリングします。
  const { env } = getCloudflareContext();
  if (pathname.endsWith("/sign-in/email")) {
    const securityResponse = await protectPublicPost(request, env.LAFTER, {
      namespace: "admin-sign-in",
      limit: 10,
      windowSeconds: 15 * 60,
      maxBodyBytes: MAX_AUTH_BODY_BYTES,
    });
    if (securityResponse) return securityResponse;

    // 元のリクエスト本文を残したまま、チャンク転送を含む実サイズを検証します。
    const parsedBody = await parseLimitedJson<Record<string, unknown>>(
      request.clone() as unknown as Parameters<typeof parseLimitedJson>[0],
      MAX_AUTH_BODY_BYTES,
    );
    if (!parsedBody.ok) return parsedBody.response;
  }

  const auth = getAuth(env.DB, env.ADMIN_EMAIL, env.BETTER_AUTH_SECRET);
  return auth.handler(request);
};

export { handler as GET, handler as POST };
