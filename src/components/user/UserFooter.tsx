import { faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Image from "next/image";
import Link from "next/link";
import styles from "./userTheme.module.scss";

type UserFooterProps = {
  onContactClick: () => void;
};

export function UserFooter({ onContactClick }: UserFooterProps) {
  return (
    // ヘッダーと統一した落ち着いたダークトーンで、フッターでも一体感を丁寧に演出します。
    <footer className={styles.footer}>
      {/* 上下24px（py-6）で静かな余白を設け、ヘッダーとバランスを丁寧に保ちます。 */}
      <div className={styles.footerInner}>
        <div className={styles.footerLinks}>
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
          {/* X アカウントへの公式導線を設置し、外部でも最新情報を丁寧に届けます。 */}
          <a
            href="https://x.com/_yokonari"
            target="_blank"
            rel="noreferrer"
            className={styles.footerLink}
            aria-label="@_yokonari"
          >
            {/* Font Awesome のブランド向けアイコンから X（旧 Twitter）を選択し、ブランド表現を丁寧に統一します。 */}
            <FontAwesomeIcon icon={faXTwitter} aria-hidden="true" />
          </a>
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
