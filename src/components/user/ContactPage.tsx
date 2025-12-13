'use client';

import { Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { motion } from "motion/react";
import type { FormEvent } from "react";
import Link from "next/link";
import styles from "./userTheme.module.scss";

// ユーザー画面に溶け込むシンプルな問い合わせページです。
export function ContactPage() {
    const [sending, setSending] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [messageDraft, setMessageDraft] = useState("");
    const [isSuccess, setIsSuccess] = useState(false);
    const baseId = useId();

    // input の id を安定させてラベルとの紐付けを丁寧に保ちます。
    const nameId = useMemo(() => `${baseId}-name`, [baseId]);
    const emailId = useMemo(() => `${baseId}-email`, [baseId]);
    const messageId = useMemo(() => `${baseId}-message`, [baseId]);

    // フォーム送信時は入力をまとめて API に渡し、結果に応じてメッセージを丁寧に表示します。
    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (sending) return;
        const form = event.currentTarget;
        const formData = new FormData(form);
        const name = formData.get("name");
        const email = formData.get("email");

        if (messageDraft.trim().length === 0) {
            form.querySelector<HTMLTextAreaElement>('textarea[name="message"]')?.focus();
            return;
        }

        setSending(true);
        setErrorMessage(null);

        try {
            const response = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: typeof name === "string" ? name : "",
                    email: typeof email === "string" ? email : "",
                    message: messageDraft,
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => null);
                const msg =
                    data && typeof data === "object" && "message" in data && typeof (data as Record<string, unknown>).message === "string"
                        ? ((data as Record<string, unknown>).message as string)
                        : "送信に失敗しました。時間を置いて再度お試しください。";
                setErrorMessage(msg);
                return;
            }

            form.reset();
            setMessageDraft("");
            setIsSuccess(true);
        } catch (error) {
            console.error("Failed to submit contact form", error);
            setErrorMessage("通信中にエラーが発生しました。ネットワーク環境をご確認のうえ再度お試しください。");
        } finally {
            setSending(false);
        }
    };

    // 送信成功時の表示
    if (isSuccess) {
        return (
            <motion.main
                className={styles.contactPageLayout}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
            >
                <div className={styles.contactPageCard}>
                    <div className={styles.contactSuccessContent}>
                        <CheckCircle size={48} className={styles.contactSuccessIcon} aria-hidden="true" />
                        <h1 className={styles.contactSuccessTitle}>お問い合わせありがとうございました</h1>
                        <p className={styles.contactSuccessMessage}>
                            内容を確認のうえ、必要に応じてご連絡いたします。
                        </p>
                        <Link href="/" className={styles.contactBackButton}>
                            <ArrowLeft size={16} aria-hidden="true" />
                            トップへ戻る
                        </Link>
                    </div>
                </div>
            </motion.main>
        );
    }

    return (
        <motion.main
            className={styles.contactPageLayout}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
        >
            <div className={styles.contactPageBackWrap}>
                <Link href="/" className={styles.contactPageBackLink}>
                    <ArrowLeft aria-hidden="true" size={20} className={styles.contactPageBackIcon} />
                    <span>トップへ戻る</span>
                </Link>
            </div>
            <div className={styles.contactPageCard}>
                <div className={styles.contactPageHeader}>
                    <h1 className={styles.contactPageTitle}>お問い合わせ</h1>
                </div>

                <p className={styles.contactHelper}>
                    下記フォームからお問い合わせ内容をご記入のうえ送信してください。
                </p>

                <form className={styles.contactForm} onSubmit={handleSubmit}>
                    {/* 名前とメールアドレスは任意項目です。autoComplete でさりげなく入力を補助します。 */}
                    <label htmlFor={nameId} className={styles.contactLabel}>
                        お名前（任意）
                        <input
                            id={nameId}
                            name="name"
                            type="text"
                            autoComplete="name"
                            className={styles.contactInput}
                        />
                    </label>

                    <label htmlFor={emailId} className={styles.contactLabel}>
                        メールアドレス（任意）
                        <input
                            id={emailId}
                            name="email"
                            type="email"
                            autoComplete="email"
                            className={styles.contactInput}
                        />
                        <span className={styles.contactHelper}>返信を希望される場合はメールアドレスをご記入ください。</span>
                    </label>

                    <label htmlFor={messageId} className={styles.contactLabel}>
                        お問い合わせ内容 <span className={styles.contactRequired}>*必須</span>
                        <textarea
                            id={messageId}
                            name="message"
                            required
                            rows={6}
                            value={messageDraft}
                            onChange={(event) => setMessageDraft(event.target.value)}
                            className={styles.contactTextarea}
                            placeholder="ご質問やご要望をご入力ください"
                        />
                    </label>

                    {errorMessage && <p className={styles.contactError}>{errorMessage}</p>}

                    <div className={styles.contactPageActions}>
                        <button type="submit" disabled={sending || messageDraft.trim().length === 0} className={styles.contactPageSubmit}>
                            {sending ? (
                                <>
                                    <Loader2 size={16} className={styles.reportSubmitSpinner} aria-hidden="true" />
                                    送信中…
                                </>
                            ) : (
                                "送信する"
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </motion.main>
    );
}
