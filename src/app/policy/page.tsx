import { readFile } from "node:fs/promises";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import styles from "../../components/user/userTheme.module.scss";

export const runtime = "nodejs";

export default async function PolicyPage() {
  // Node.js ランタイムで確実に読めるよう、ビルド時に同梱された Markdown をファイルから取得します。
  const filePath = path.join(process.cwd(), "src/content/policy.md");
  const policyMarkdown = await readFile(filePath, "utf8");

  // ユーザー画面のダークトーンを踏襲し、SCSS で共通管理する配色と余白を利用して読み物ページを整えます。
  const markdownComponents = {
    h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h1 className={styles.policyHeading1} {...props} />
    ),
    h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h2 className={styles.policyHeading2} {...props} />
    ),
    h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h3 className={styles.policyHeading3} {...props} />
    ),
    p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p className={styles.policyParagraph} {...props} />
    ),
    ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
      <ul className={styles.policyList} {...props} />
    ),
    ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
      <ol className={styles.policyList} {...props} />
    ),
    li: (props: React.HTMLAttributes<HTMLLIElement>) => (
      <li className={styles.policyListItem} {...props} />
    ),
    strong: (props: React.HTMLAttributes<HTMLElement>) => (
      <strong className={styles.policyStrong} {...props} />
    ),
    a: (props: React.HTMLAttributes<HTMLAnchorElement>) => (
      <a className={styles.policyLink} {...props} />
    ),
  };

  return (
    // 読み物としての落ち着きを意識し、CSS モジュール由来の共通余白で読みやすさを丁寧に調整します。
    <main className={styles.policyLayout}>
      {/* トップへ戻る導線をカード左上から 24px 上に配置し、シンプルなテキストリンクで案内します。 */}
      <div className={styles.policyBackWrap}>
        <Link href="/" className={styles.policyBackLink}>
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
      <div className={styles.policyArticle}>
        {/* ReactMarkdown で Markdown を安全に変換し、構造を保ったまま描画します。 */}
        <ReactMarkdown components={markdownComponents}>{policyMarkdown}</ReactMarkdown>
      </div>
    </main>
  );
}
