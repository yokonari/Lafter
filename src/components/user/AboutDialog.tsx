'use client';

import { Gift, Info, Megaphone, X } from "lucide-react";
import { Fragment, useCallback, useId, useMemo } from "react";
import { toast } from "react-toastify";
import type { ReactNode } from "react";
import styles from "./userTheme.module.scss";
import { UserDialogBase } from "./UserDialogBase";

type AboutDialogProps = {
  open: boolean;
  onClose: () => void;
};

const userToastAppearanceOptions = {
  className: "userToast",
} as const;

// Lafter の背景や運営方針を丁寧にまとめた説明ダイアログです。開閉中のアクセシビリティに配慮します。
export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const titleId = useId();
  // Amazon eギフトの受取人アドレスを環境変数から一元管理し、表示やコピー処理の記述を丁寧にまとめます。
  const donationRecipientEmail =
    process.env.NEXT_PUBLIC_CONTACT_TO_EMAIL ?? process.env.CONTACT_TO_EMAIL ?? "yokonari10@gmail.com";
  // クリップボード API とフォールバックを用意し、クリック一度で確実にアドレスをコピーできるよう配慮します。
  const handleCopyDonationEmail = useCallback(() => {
    // 成否で適切なトーストを出し分け、コピー操作の結果を丁寧にフィードバックします。
    // ユーザー向けテーマに寄せた装飾を適用するため、トースト用のクラス指定をまとめます。
    const notifySuccess = () => toast.success("受取人アドレスをコピーしました。", userToastAppearanceOptions);
    const notifyFailure = () => toast.error("コピーに失敗しました。手動でコピーしてください。", userToastAppearanceOptions);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard
        .writeText(donationRecipientEmail)
        .then(notifySuccess)
        .catch(() => notifyFailure());
      return;
    }
    if (typeof document === "undefined") {
      notifyFailure();
      return;
    }
    // clipboard API が使えない環境でも丁寧にコピーできるよう、一時的な textarea を生成して execCommand を呼び出します。
    const textarea = document.createElement("textarea");
    textarea.value = donationRecipientEmail;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      const copied = document.execCommand("copy");
      if (copied) {
        notifySuccess();
      } else {
        notifyFailure();
      }
    } catch {
      notifyFailure();
    } finally {
      document.body.removeChild(textarea);
    }
  }, [donationRecipientEmail]);
  // usage ダイアログと同じく配列をまとめ、描画時に並び順や内容がぶれないように丁寧にメモ化します。
  const sections = useMemo<Array<{ icon: ReactNode; title: string; paragraphs: ReactNode[] }>>(
    () => [
      {
        icon: <Info size={24} className={styles.aboutIcon} aria-hidden="true" />,
        title: "Lafter?",
        paragraphs: [
          "お笑い芸人や劇場の公式チャンネルからネタ動画を探せる個人運営のアプリです。",
        ],
      },
      {
        icon: <Megaphone size={24} className={styles.aboutIcon} aria-hidden="true" />,
        title: "制作者",
        paragraphs: [
          <a
            key="section-author-link"
            href="https://x.com/_yokonari"
            target="_blank"
            rel="noreferrer"
            className={styles.aboutLink}
          >よこなり</a>,
        ],
      },
      {
        icon: <Gift size={24} className={styles.aboutIcon} aria-hidden="true" />,
        title: "応援について",
        paragraphs: [
          "応援いただけると励みになります。",
          <a
            key="section-support-link"
            href="https://www.amazon.co.jp/Amazon-eGift-Card-Amazon-Logo-Animated/dp/B06X982RQ9/?gpo=300&tag=madmania-22"
            target="_blank"
            rel="noreferrer"
            className={styles.aboutLink}
          >Amazon eギフト</a>,
          <Fragment key="section-support-email">
            {/* 受取人アドレスとコピー導線をまとめ、寄付の前準備を丁寧にサポートします。 */}
            <button
              type="button"
              onClick={handleCopyDonationEmail}
              className={styles.aboutCopyButton}
              aria-label="受取人のメールアドレスをコピー"
            >受取人のメールアドレスをコピー</button>
          </Fragment>,
        ],
      },
    ],
    [handleCopyDonationEmail],
  );

  // 共通ダイアログベースに処理を委譲し、モーションやESC対応・背面スクロール抑止を丁寧に共通化します。
  return (
    <UserDialogBase
      open={open}
      onClose={onClose}
      dialogClassName={styles.aboutDialog}
      overlayClassName={styles.contactOverlay}
      ariaLabelledby={titleId}
      disableBodyScroll
      closeOnEsc
    >
      <div className={styles.contactHeader}>
        <h2 id={titleId} className={styles.contactTitle}>
          このサイトについて
        </h2>
        <button
          type="button"
          onClick={onClose}
          className={styles.contactClose}
          aria-label="ダイアログを閉じる"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.aboutBody}>
        {/* usage ダイアログと同じく、各ブロックでアイコン＋テキストを横並びにし、視線誘導を丁寧に揃えます。 */}
        {sections.map((section) => (
          <section key={section.title} className={styles.aboutItem}>
            <div className={styles.aboutIconWrap}>{section.icon}</div>
            <div>
              <h3 className={styles.aboutSectionTitle}>{section.title}</h3>
              {section.paragraphs.map((paragraph, index) => (
                <p key={`${section.title}-${index}`} className={styles.aboutText}>
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className={styles.aboutActions}>
        <button
          type="button"
          onClick={onClose}
          className={styles.aboutActionButton}
        >
          閉じる
        </button>
      </div>
    </UserDialogBase>
  );
}
