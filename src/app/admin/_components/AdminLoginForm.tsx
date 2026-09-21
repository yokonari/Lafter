"use client";

import { FormEvent, useState } from "react";
import styles from "../adminTheme.module.scss";

export function AdminLoginForm() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // 管理者認証 API へ丁寧にサインインを依頼します。
    const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage(null);
        setSubmitting(true);
        try {
            const response = await fetch("/api/auth/sign-in/email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const responseData = await response.json().catch(() => null) as Record<string, unknown> | null;
            if (!response.ok) {
                setMessage(
                    responseData && typeof responseData.message === "string"
                        ? responseData.message
                        : "ログインに失敗しました。",
                );
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
                    // 認証完了後は丁寧に動画管理ページへお連れし、作業開始までの導線を最短化いたします。
                    window.location.href = "/admin/videos";
                }, 1000);
            }
        } catch (error) {
            // メールアドレス認証が失敗した場合も丁寧に利用者へお知らせします。
            const errorMessage =
                error instanceof Error ? error.message : "ログインに失敗しました。";
            setMessage(errorMessage);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        // 管理画面のテーマに沿ったレイアウトで包み、他セクションとの一体感を丁寧に持たせます。
        <main className={styles.adminLayout}>
            <section className={styles.loginBody}>
                <div className={styles.loginShell}>
                    <div className={styles.loginHeader}>
                        <h1 className={styles.loginTitle}>管理画面</h1>
                        <p className={styles.loginSubtitle}>
                            メールアドレスとパスワードでログインしてください。
                        </p>
                    </div>
                    <form className={styles.loginForm} onSubmit={handleSignIn}>
                        <div className={styles.loginField}>
                            <label className={styles.loginLabel} htmlFor="email">
                                メールアドレス
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                className={styles.loginInput}
                                required
                                autoComplete="email"
                                disabled={submitting}
                            />
                        </div>
                        <div className={styles.loginField}>
                            <label className={styles.loginLabel} htmlFor="password">
                                パスワード
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                className={styles.loginInput}
                                required
                                autoComplete="current-password"
                                disabled={submitting}
                            />
                        </div>
                        <div className={styles.loginActions}>
                            <button
                                type="submit"
                                className={styles.loginSubmit}
                                disabled={submitting}
                            >
                                {submitting ? "認証中…" : "ログイン"}
                            </button>
                        </div>
                    </form>
                    {message && <p className={styles.loginMessage}>{message}</p>}
                </div>
            </section>
        </main>
    );
}
