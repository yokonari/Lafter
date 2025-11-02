import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAuth } from "@/lib/admin-auth";

const handler = (request: Request) => {
  // Cloudflare D1 を利用した認証エンドポイントを丁寧にハンドリングします。
  const { env } = getCloudflareContext();
  const auth = getAuth(env.DB);
  return auth.handler(request);
};

export { handler as GET, handler as POST };
