'use client';

import { useEffect, useId, useMemo, useState } from "react";
import type { FormEvent } from "react";
import styles from "./userTheme.module.scss";

type ContactDialogProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

// ユーザー画面に溶け込むシンプルな問い合わせモーダルです。閉じた時に状態を丁寧に初期化します。
export function ContactDialog({ open, onClose, onSuccess }: ContactDialogProps) {
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const titleId = useId();
  const descriptionId = useId();

  // input の id を安定させてラベルとの紐付けを丁寧に保ちます。
  const nameId = useMemo(() => `${titleId}-name`, [titleId]);
  const emailId = useMemo(() => `${titleId}-email`, [titleId]);
  const messageId = useMemo(() => `${titleId}-message`, [titleId]);

  // ダイアログが開いている間は背面スクロールを抑制し、閉じる際に元へ戻します。
  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setSending(false);
      setErrorMessage(null);
      setMessageDraft("");
    }
  }, [open]);

  const handleClose = () => {
    setSending(false);
    setErrorMessage(null);
    onClose();
  };

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
      onClose();
      onSuccess?.();
    } catch (error) {
      console.error("Failed to submit contact form", error);
      setErrorMessage("通信中にエラーが発生しました。ネットワーク環境をご確認のうえ再度お試しください。");
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className={styles.contactOverlay} role="presentation" onClick={handleClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={styles.contactDialog}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.contactHeader}>
          <div>
            <h2 id={titleId} className={styles.contactTitle}>
              お問い合わせ
            </h2>
          </div>
          <button type="button" onClick={handleClose} className={styles.contactClose} aria-label="ダイアログを閉じる">
            <span className="material-symbols-rounded" aria-hidden="true">
              close
            </span>
          </button>
        </div>

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
            お問い合わせ内容
            <textarea
              id={messageId}
              name="message"
              required
              rows={4}
              value={messageDraft}
              onChange={(event) => setMessageDraft(event.target.value)}
              className={styles.contactTextarea}
              placeholder="ご質問やご要望をご入力ください"
            />
          </label>

          {errorMessage && <p className={styles.contactError}>{errorMessage}</p>}

          <div className={styles.contactActions}>
            <button type="button" onClick={handleClose} className={styles.contactCancel}>
              キャンセル
            </button>
            <button type="submit" disabled={sending || messageDraft.trim().length === 0} className={styles.contactSubmit}>
              {sending ? "送信中…" : "送信"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
