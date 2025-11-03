import { APIError } from "better-auth/api";
// エラーハンドリングでは公式 API モジュールの APIError を丁寧に参照します。
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAuth } from "@/lib/admin-auth";

type RegisterRequestBody = {
  email?: unknown;
  password?: unknown;
  name?: unknown;
};

export async function POST(request: Request) {
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

  const { env } = getCloudflareContext();
  const auth = getAuth(env.DB);

  try {
    const result = await auth.api.signUpEmail({
      body: {
        name,
        email,
        password,
      },
      headers: request.headers,
      request,
    });

    return Response.json(
      {
        message: "管理者登録が完了しました。",
        token: result.token ?? null,
        user: result.user,
      },
      { status: 201 },
    );
  } catch (error) {
    // 認証ライブラリからのエラー内容も丁寧に変換してお知らせいたします。
    if (error instanceof APIError) {
      const statusCode =
        typeof error.statusCode === "number"
          ? error.statusCode
          : typeof error.status === "number"
            ? error.status
            : undefined;
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
