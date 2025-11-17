import fs from "node:fs";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import Link from "next/link";

export default function PolicyPage() {
  // プライバシーポリシーの Markdown を静的に読み込み、文面を丁寧にそのまま表示します。
  const filePath = path.join(process.cwd(), "src/content/policy.md");
  const policyMarkdown = fs.readFileSync(filePath, "utf8");

  // ユーザー画面のダークトーンを踏襲し、読みやすいタイポグラフィで丁寧に整えます。
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
    padding: 0,
    marginBottom: "16px",
    color: "#e2e8f0",
    textDecoration: "none",
  };
  const markdownComponents = {
    h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h1
        style={{
          fontSize: "2rem",
          fontWeight: 700,
          margin: "0 0 16px",
          color: "#f8fafc",
        }}
        {...props}
      />
    ),
    h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h2
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          margin: "28px 0 14px",
          color: "#f8fafc",
        }}
        {...props}
      />
    ),
    h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h3
        style={{
          fontSize: "1.2rem",
          fontWeight: 700,
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
    // 読み物としての落ち着きを意識し、最大幅と余白で読みやすさを丁寧に調整します。
    <main style={containerStyle}>
      {/* トップへ戻る導線をカード左上から 24px 上に配置し、シンプルなテキストリンクで案内します。 */}
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
        {/* ReactMarkdown で Markdown を安全に変換し、構造を保ったまま描画します。 */}
        <ReactMarkdown components={markdownComponents}>{policyMarkdown}</ReactMarkdown>
      </div>
    </main>
  );
}
