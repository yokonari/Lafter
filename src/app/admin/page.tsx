"use client";

import { FormEvent, useMemo, useState } from "react";
import { createAuthClient } from "better-auth/client";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const authClient = useMemo(() => {
    const baseURL =
      typeof window === "undefined" ? undefined : `${window.location.origin}/api/auth`;
    return createAuthClient(baseURL ? { baseURL } : {});
  }, []);

  // 管理者認証 API へ丁寧にサインインを依頼します。
  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const { error: responseError } = await authClient.signIn.email({ email, password });
      // API が丁寧に返したエラーも画面で分かりやすく利用者へお伝えします。
      if (responseError) {
        let errorMessage = "ログインに失敗しました。";
        if (typeof responseError === "object" && responseError !== null) {
          if ("message" in responseError && typeof responseError.message === "string") {
            errorMessage = responseError.message;
          } else if ("statusText" in responseError && typeof responseError.statusText === "string") {
            errorMessage = responseError.statusText;
          }
        } else if (typeof responseError === "string") {
          errorMessage = responseError;
        }
        setMessage(errorMessage);
        return;
      }
      setMessage("ログインに成功しました。数秒後に画面が遷移します。");
    } catch (error) {
      // メールアドレス認証が失敗した場合も丁寧に利用者へお知らせします。
      const errorMessage =
        error instanceof Error ? error.message : "ログインに失敗しました。";
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-6">
      <section className="bg-white shadow-md rounded-lg w-full max-w-md p-6">
        <h1 className="text-2xl font-semibold text-center mb-2">管理画面</h1>
        <p className="text-sm text-center text-slate-500 mb-4">
          メールアドレスとパスワードでログインしてください。
        </p>
        <form className="space-y-4" onSubmit={handleSignIn}>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600" htmlFor="email">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="admin@example.com"
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-sm font-medium text-slate-600"
              htmlFor="password"
            >
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="********"
              required
              autoComplete="current-password"
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            className="w-full bg-slate-900 hover:bg-slate-950 text-white font-medium py-2 rounded transition-colors disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "認証中…" : "ログイン"}
          </button>
        </form>
        {message && (
          <p className="mt-4 text-center text-sm text-slate-600">{message}</p>
        )}
      </section>
    </main>
  );
}
