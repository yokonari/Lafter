import ReactMarkdown from "react-markdown";
import Link from "next/link";
import styles from "../../components/user/userTheme.module.scss";

export const runtime = "nodejs";

export default async function PolicyPage() {
  // 外部読み込みを避け、ビルドに同梱したMarkdown本文を直接埋め込みます。
  const policyMarkdown = `# Lafter プライバシーポリシー

Lafter（以下「本サービス」といいます。）は、本サービスにおけるユーザー情報の取扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」といいます。）を定めます。本サービスを利用することにより、ユーザーは本ポリシーに同意したものとみなされます。

## 第1条（運営者情報）

本サービスの運営者情報は以下のとおりです。

- サービス名：Lafter
- 運営者：よこなり
- お問い合わせ窓口：

## 第2条（取得する情報）

本サービスは、ユーザーについて以下の情報を取得する場合があります。

1. **アクセスログ情報**
   IP アドレス、ブラウザ情報、OS 情報、閲覧日時、参照元 URL など

2. **Cookie および類似技術による情報**
   本サービスは、Cookie やローカルストレージ等の技術を利用して、ユーザーの設定情報の保存や、利用状況の把握等を行う場合があります。

3. **YouTube API Services により取得する情報**
   動画 ID、タイトル、説明文、サムネイル画像 URL、チャンネル名、再生回数等、YouTube 上で公開されている情報

本サービスは現在、ユーザー登録やログイン機能を提供しておらず、ユーザーの氏名・メールアドレス等の連絡先情報を直接取得することは想定していません。

## 第3条（情報の利用目的）

本サービスは、取得した情報を以下の目的で利用します。

1. 本サービスの提供および運営のため
2. お笑い動画検索機能等の表示内容の改善・最適化のため
3. アクセス状況の解析、サービス利用統計の作成のため
4. 不正アクセスやサービス妨害行為の検知・防止のため
5. サービス改善・新機能開発のため
6. 法令または行政機関の要請に基づく対応のため

## 第4条（YouTube API Services に関する事項）

1. 本サービスは、Google が提供する YouTube API Services を利用しています。
2. 本サービスの利用にあたっては、ユーザーは以下の規約・ポリシーにも同意したものとみなされます。
   - YouTube 利用規約：<https://www.youtube.com/t/terms>
   - Google プライバシーポリシー：<http://www.google.com/policies/privacy>
3. 本サービスは、YouTube API Services を通じて取得した公開情報を、本ポリシーおよび上記ポリシーに従って取り扱います。
4. 本サービスは現在、ユーザーの Google アカウントに紐づく非公開データ（いわゆる「承認済みデータ」）にはアクセスしていません。

## 第5条（アクセス解析ツールの利用）

1. 本サービスでは、今後、Google アナリティクス等のアクセス解析ツールを利用する場合があります。
2. これらのツールは、Cookie 等を利用して匿名のトラフィックデータを収集することがあります。
3. 収集されるデータの取扱いについては、各ツール提供者のプライバシーポリシーに従います。

## 第6条（広告配信について）

1. 本サービスでは、今後、第三者の広告配信サービスによるバナー広告等を表示する場合があります。
2. 広告配信事業者は、Cookie 等を利用してユーザーのアクセス情報を収集し、ユーザーの興味関心に応じた広告を表示することがあります。
3. 利用する広告配信サービスの詳細および各事業者のプライバシーポリシーについては、導入時に本サービス上で別途案内します。

## 第7条（Cookie・ローカルストレージの利用）

1. 本サービスは、ユーザーの表示設定の保存や利便性向上のため、Cookie やローカルストレージ等を利用します。
2. ユーザーは、ブラウザの設定により Cookie の保存を拒否することができます。ただし、その場合、本サービスの一部機能が正常に動作しない可能性があります。

## 第8条（第三者提供）

運営者は、法令に基づく場合を除き、ユーザー情報をユーザーの同意なく第三者に提供しません。ただし、前述のアクセス解析ツール・広告配信サービス等への情報送信は、この限りではありません。

## 第9条（情報の管理）

運営者は、ユーザー情報への不正アクセス、漏えい、改ざん、滅失等を防止するため、合理的な範囲で必要かつ適切な安全管理措置を講じます。

## 第10条（お問い合わせ）

本ポリシーに関するお問い合わせは、第1条に定めるお問い合わせ窓口までご連絡ください。

## 第11条（プライバシーポリシーの変更）

1. 本ポリシーの内容は、法令の改正やサービス内容の変更等に応じて、運営者の判断により変更されることがあります。
2. 本ポリシーの変更は、本サービス上に掲載した時点から効力を生じるものとします。`;

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
