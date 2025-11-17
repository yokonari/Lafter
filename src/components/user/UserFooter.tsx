import Image from "next/image";
import Link from "next/link";
import styles from "./userTheme.module.scss";

export function UserFooter() {
  return (
    // ヘッダーと統一した落ち着いたダークトーンで、フッターでも一体感を丁寧に演出します。
    <footer className={styles.footer}>
      {/* 上下24px（py-6）で静かな余白を設け、ヘッダーとバランスを丁寧に保ちます。 */}
      <div className={styles.footerInner}>
        <div className={styles.footerLinks}>
          <a href="#" className={styles.footerLink}>
            問い合わせ
          </a>
          {/* 静的ページへ丁寧に遷移させ、利用規約の全文をユーザーにしっかり案内します。 */}
          <Link href="/terms" className={styles.footerLink}>
            利用規約
          </Link>
          {/* プライバシーポリシーも同様に、Markdown から整然と表示する画面へ案内します。 */}
          <Link href="/policy" className={styles.footerLink}>
            プライバシーポリシー
          </Link>
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
