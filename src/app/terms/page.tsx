import { readFile } from "node:fs/promises";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import styles from "../../components/user/userTheme.module.scss";

export const runtime = "nodejs";

export default async function TermsPage() {
  // Node.js ランタイムで確実に読めるよう、ビルド時に同梱された Markdown をファイルから取得します。
  const filePath = path.join(process.cwd(), "src/content/terms.md");
  const termsMarkdown = await readFile(filePath, "utf8");

  const markdownComponents = {
    h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h1 className={styles.termsHeading1} {...props} />
    ),
    h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h2 className={styles.termsHeading2} {...props} />
    ),
    h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h3 className={styles.termsHeading3} {...props} />
    ),
    p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p className={styles.termsParagraph} {...props} />
    ),
    ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
      <ul className={styles.termsList} {...props} />
    ),
    ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
      <ol className={styles.termsList} {...props} />
    ),
    li: (props: React.HTMLAttributes<HTMLLIElement>) => (
      <li className={styles.termsListItem} {...props} />
    ),
    strong: (props: React.HTMLAttributes<HTMLElement>) => (
      <strong className={styles.termsStrong} {...props} />
    ),
    a: (props: React.HTMLAttributes<HTMLAnchorElement>) => (
      <a className={styles.termsLink} {...props} />
    ),
  };

  return (
    // シンプルな紙面のような余白を確保し、落ち着いた読みやすさを丁寧に演出します。
    <main className={styles.termsLayout}>
      {/* トップに戻る導線をカード左上から 24px 上に配置し、シンプルなテキストリンクで案内します。 */}
      <div className={styles.termsBackWrap}>
        <Link href="/" className={styles.termsBackLink}>
          {/* マテリアルアイコンで戻る方向を視覚的に示し、リンク文言との一体感を丁寧に演出します。 */}
          <span
            className="material-symbols-rounded"
            aria-hidden="true"
            style={{ fontSize: "20px", lineHeight: 1, verticalAlign: "middle" }}
          >
            arrow_back
          </span>
          <span>トップへ戻る</span>
        </Link>
      </div>
      <div className={styles.termsArticle}>
        {/* ReactMarkdown で Markdown を安全に変換し、原文を大切に表示します。 */}
        <ReactMarkdown components={markdownComponents}>{termsMarkdown}</ReactMarkdown>
      </div>
    </main>
  );
}
