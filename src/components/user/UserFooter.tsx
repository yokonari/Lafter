'use client';

import Image from "next/image";
import Link from "next/link";
import { XShareButton } from "./XShareButton";
import styles from "./userTheme.module.scss";

type UserFooterProps = {
  onContactClick: () => void;
  onAboutClick: () => void;
};

export function UserFooter({ onContactClick, onAboutClick }: UserFooterProps) {
  return (
    // ヘッダーと統一した落ち着いたダークトーンで、フッターでも一体感を丁寧に演出します。
    <footer className={styles.footer}>
      {/* 上下24px（py-6）で静かな余白を設け、ヘッダーとバランスを丁寧に保ちます。 */}
      <div className={styles.footerInner}>
        <div className={styles.footerLinks}>
          {/* サイト紹介ダイアログへの導線を用意し、新規訪問者にも安心して使ってもらえるよう丁寧に説明します。 */}
          <button type="button" className={styles.footerLinkButton} onClick={onAboutClick}>
            このサイトについて
          </button>
          <button type="button" className={styles.footerLinkButton} onClick={onContactClick}>
            お問い合わせ
          </button>
          {/* 静的ページへ丁寧に遷移させ、利用規約の全文をユーザーにしっかり案内します。 */}
          <Link href="/terms" className={styles.footerLink}>
            利用規約
          </Link>
          {/* プライバシーポリシーも同様に、Markdown から整然と表示する画面へ案内します。 */}
          <Link href="/policy" className={styles.footerLink}>
            プライバシーポリシー
          </Link>
          <XShareButton className={styles.footerInlineShareButton} />
        </div>

        <div className={styles.footerBadge}>
          <a href="https://youtube.com/" target="_blank" rel="noreferrer" aria-label="YouTube">
            <Image
              src="/developed-with-youtube-sentence-case-light.png"
              alt="Developed with YouTube"
              width={192}
              height={68}
              className={styles.footerBadgeImage}
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
