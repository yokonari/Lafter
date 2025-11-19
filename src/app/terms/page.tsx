import { readFile } from "node:fs/promises";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import Link from "next/link";

export const runtime = "nodejs";

export default async function TermsPage() {
  // Node.js ランタイムで確実に読めるよう、ビルド時に同梱された Markdown をファイルから取得します。
  const filePath = path.join(process.cwd(), "src/content/terms.md");
  const termsMarkdown = await readFile(filePath, "utf8");

  // ユーザー画面のダークトーンに揃え、読み物としてのまとまりと視認性を丁寧に整えます。
  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "#020617",
    color: "#e2e8f0",
    padding: "72px 1rem 48px",
  };
  const articleStyle: React.CSSProperties = {
    maxWidth: 800,
    margin: "0 auto",
    padding: "24px",
    background: "#0b1224",
    border: "1px solid #1f2937",
    borderRadius: "16px",
    boxShadow: "0 16px 48px rgba(0, 0, 0, 0.35)",
    lineHeight: 1.7,
  };
  const backButtonStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: 0,
    marginBottom: "16px",
    color: "#e2e8f0",
    textDecoration: "none",
  };
  const markdownComponents = {
    h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h1
        style={{
          fontSize: "1.25rem",
          fontWeight: 400, // 見出しは太字禁止のデザインルールに従います。
          margin: "0 0 16px",
          color: "#f8fafc",
        }}
        {...props}
      />
    ),
    h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h2
        style={{
          fontSize: "1.25rem",
          fontWeight: 400, // 見出しは太字禁止のデザインルールに従います。
          margin: "28px 0 14px",
          color: "#f8fafc",
        }}
        {...props}
      />
    ),
    h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h3
        style={{
          fontSize: "1.1rem",
          fontWeight: 400, // 見出しは太字禁止のデザインルールに従います。
          margin: "20px 0 10px",
          color: "#f8fafc",
        }}
        {...props}
      />
    ),
    p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p style={{ margin: "0 0 12px", color: "#e2e8f0" }} {...props} />
    ),
    ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
      <ul
        style={{
          paddingLeft: "1.5rem",
          margin: "0 0 12px",
          color: "#e2e8f0",
          display: "grid",
          gap: "4px",
        }}
        {...props}
      />
    ),
    ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
      <ol
        style={{
          paddingLeft: "1.5rem",
          margin: "0 0 12px",
          color: "#e2e8f0",
          display: "grid",
          gap: "4px",
        }}
        {...props}
      />
    ),
    li: (props: React.HTMLAttributes<HTMLLIElement>) => (
      <li style={{ margin: "0" }} {...props} />
    ),
    strong: (props: React.HTMLAttributes<HTMLElement>) => (
      <strong style={{ fontWeight: 700, color: "#fbbf24" }} {...props} />
    ),
    a: (props: React.HTMLAttributes<HTMLAnchorElement>) => (
      <a
        style={{
          color: "#fbbf24",
          textDecoration: "underline",
          textDecorationThickness: "2px",
          textUnderlineOffset: "4px",
        }}
        {...props}
      />
    ),
  };

  return (
    // シンプルな紙面のような余白を確保し、落ち着いた読みやすさを丁寧に演出します。
    <main style={containerStyle}>
      {/* トップに戻る導線をカード左上から 24px 上に配置し、シンプルなテキストリンクで案内します。 */}
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <Link href="/" style={backButtonStyle} className="markdownBackLink">
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
      <div style={articleStyle}>
        {/* ReactMarkdown で Markdown を安全に変換し、原文を大切に表示します。 */}
        <ReactMarkdown components={markdownComponents}>{termsMarkdown}</ReactMarkdown>
      </div>
    </main>
  );
}
