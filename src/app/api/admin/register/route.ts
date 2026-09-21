import { APIError } from "better-auth/api";
// エラーハンドリングでは公式 API モジュールの APIError を丁寧に参照します。
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAuth } from "@/lib/admin-auth";
import { verifyApiSecret } from "@/lib/api-secret";

type RegisterRequestBody = {
  email?: unknown;
  password?: unknown;
  name?: unknown;
};

export async function POST(request: Request) {
  const { env } = getCloudflareContext();
  const secretResult = verifyApiSecret(request.headers, env);
  if (!secretResult.ok) {
    return Response.json(
      { message: secretResult.status === 500 ? "管理者登録は現在利用できません。" : "登録できません。" },
      { status: secretResult.status },
    );
  }

  // 管理者登録時の入力値を丁寧に検証いたします。
  let body: RegisterRequestBody;
  try {
    body = (await request.json()) as RegisterRequestBody;
  } catch {
    return Response.json({ message: "リクエスト本文をJSONとして解釈できませんでした。" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  const name = rawName || email;

  if (!email) {
    return Response.json({ message: "メールアドレスは必須です。" }, { status: 400 });
  }
  if (!password) {
    return Response.json({ message: "パスワードは必須です。" }, { status: 400 });
  }

  const auth = getAuth(env.DB, env.ADMIN_EMAIL, env.BETTER_AUTH_SECRET);
  const allowedEmail =
    (typeof env.ADMIN_EMAIL === "string" ? env.ADMIN_EMAIL : undefined) ??
    (typeof process.env.ADMIN_EMAIL === "string" ? process.env.ADMIN_EMAIL : undefined);

  if (!allowedEmail) {
    return Response.json(
      { message: "管理者用メールアドレスが設定されていません。" },
      { status: 500 },
    );
  }

  if (email.toLowerCase() !== allowedEmail.trim().toLowerCase()) {
    return Response.json(
      { message: "登録できません。" },
      { status: 403 },
    );
  }

  try {
    // better-auth の型定義が body を undefined と解釈してしまうため、丁寧にコンテキストを整形してお渡しします。
    const signUpContext = {
      body: {
        name,
        email,
        password,
      },
      headers: request.headers,
      request,
    };
    const result = await auth.api.signUpEmail(
      signUpContext as unknown as Parameters<typeof auth.api.signUpEmail>[0],
    );

    return Response.json(
      {
        message: "管理者登録が完了しました。",
        user: { id: result.user.id, email: result.user.email },
      },
      { status: 201 },
    );
  } catch (error) {
    // 認証ライブラリからのエラー内容も丁寧に変換してお知らせいたします。
    if (error instanceof APIError) {
      const statusCode = error.statusCode || 400;
      const message =
        typeof error.message === "string" && error.message.trim() !== ""
          ? error.message
          : "登録処理に失敗しました。";
      return Response.json({ message }, { status: statusCode ?? 400 });
    }

    const message =
      error instanceof Error && error.message.trim() !== ""
        ? error.message
        : "登録処理で想定外のエラーが発生しました。";
    return Response.json({ message }, { status: 500 });
  }
}
