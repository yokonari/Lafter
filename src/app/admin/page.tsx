"use client";

import { FormEvent, useMemo, useState } from "react";
import { createAuthClient } from "better-auth/react";
import type { ClientOptions } from "better-auth/types";
// Better Auth の公式型定義を丁寧に参照し、将来も安心して利用できるようにいたします。

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<"login" | "register" | null>(null);

  type BaseAuthClient = ReturnType<typeof createAuthClient<ClientOptions>>;
  type AuthClient = BaseAuthClient & {
    signIn: {
      email: (params: { email: string; password: string }) => Promise<{
        data?: Record<string, unknown> | null;
        error?: unknown;
      }>;
    };
  };
  const authClient = useMemo<AuthClient>(() => {
    const baseURL =
      typeof window === "undefined" ? undefined : `${window.location.origin}/api/auth`;
    return createAuthClient<ClientOptions>(baseURL ? { baseURL } : {}) as AuthClient;
  }, []);

  // 管理者認証 API へ丁寧にサインインを依頼します。
  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setSubmittingAction("login");
    try {
      const { data: responseData, error: responseError } = await authClient.signIn.email({
        email,
        password,
      });
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

      const successMessage =
        typeof responseData === "object" &&
        responseData !== null &&
        "message" in responseData &&
        typeof responseData.message === "string" &&
        responseData.message.trim() !== ""
          ? responseData.message
          : "ログインに成功しました。少々お待ちください。";
      setMessage(successMessage);
      if (typeof window !== "undefined") {
        // 成功後は丁寧に画面を更新し、最新の認証状態を反映いたします。
        setTimeout(() => {
          if (
            responseData &&
            typeof responseData === "object" &&
            "redirect" in responseData &&
            responseData.redirect === true &&
            "url" in responseData &&
            typeof responseData.url === "string"
          ) {
            window.location.href = responseData.url;
            return;
          }
          // 認証完了後は丁寧に動画一覧ページへご案内し、管理作業へ素早く移れるようにいたします。
          window.location.href = "/admin/videos";
        }, 1000);
      }
    } catch (error) {
      // メールアドレス認証が失敗した場合も丁寧に利用者へお知らせします。
      const errorMessage =
        error instanceof Error ? error.message : "ログインに失敗しました。";
      setMessage(errorMessage);
    } finally {
      setSubmittingAction(null);
    }
  };

  // 新規管理者登録の手続きを丁寧に実行します。
  const handleRegister = async () => {
    setMessage(null);
    setSubmittingAction("register");
    try {
      const response = await fetch("/api/admin/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        const errorMessage =
          typeof data?.message === "string" && data.message.trim() !== ""
            ? data.message
            : "管理者登録に失敗しました。";
        setMessage(errorMessage);
        return;
      }
      setMessage(
        typeof data?.message === "string" && data.message.trim() !== ""
          ? data.message
          : "登録が完了しました。続いてログインしてください。",
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "登録処理で予期せぬエラーが発生しました。";
      setMessage(errorMessage);
    } finally {
      setSubmittingAction(null);
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
              disabled={submittingAction !== null}
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
              disabled={submittingAction !== null}
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 bg-slate-900 hover:bg-slate-950 text-white font-medium py-2 rounded transition-colors disabled:opacity-60"
              disabled={submittingAction !== null}
            >
              {submittingAction === "login" ? "認証中…" : "ログイン"}
            </button>
            <button
              type="button"
              className="flex-1 border border-slate-300 text-slate-900 font-medium py-2 rounded transition-colors hover:bg-slate-100 disabled:opacity-60"
              onClick={handleRegister}
              disabled={submittingAction !== null}
            >
              {submittingAction === "register" ? "登録処理中…" : "登録"}
            </button>
          </div>
        </form>
        {message && (
          <p className="mt-4 text-center text-sm text-slate-600">{message}</p>
        )}
      </section>
    </main>
  );
}
