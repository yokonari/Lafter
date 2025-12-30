import { ImageResponse } from "next/og";

// OpenNext の制約に合わせ、ランタイムは Node.js として扱い安定したビルドを優先します。
export const runtime = "nodejs";
// Next.js の通常の Route では size や contentType を export せず、ローカル定数として扱います。
const size = {
  width: 1200,
  height: 630,
} as const;
const contentType = "image/png" as const;
// テキスト領域の最大幅・最大高さを定数化し、複数箇所で共有して制約を統一します。
const textMaxWidth = 850;
const textMaxHeight = 350;
const headingFontSize = 60;
const headingLineHeight = 1.4;
const approximateCharsPerLine = Math.max(10, Math.floor(textMaxWidth / (headingFontSize * 0.9)));
const headingLineClamp = Math.max(1, Math.floor(textMaxHeight / (headingFontSize * headingLineHeight)));
const headingMaxCharacters = headingLineClamp * approximateCharsPerLine;
const headingInputHardLimit = headingMaxCharacters * 2;

function clampHeadingText(text: string): string {
  if (text.length <= headingMaxCharacters) {
    return text;
  }
  const clampTarget = Math.max(1, headingMaxCharacters - 1);
  return `${text.slice(0, clampTarget)}…`;
}

// ImageResponse の fonts オプションへ渡す情報を型で固定し、太字フォントの取り扱いを統一します。
type OgFontOption = { name: string; data: ArrayBuffer; weight: 700; style: "normal" };
// リクエストが飛んできたオリジンを基準に public/fonts 配下のファイルへ HTTP でアクセスし、Node/Edge いずれの環境でも安定的に取得します。
async function loadBoldFont(request: Request): Promise<OgFontOption | null> {
  // request.url から origin を抽出しておくことで、ローカル(host:3000)と本番(host:xxx)を問わず同一の fetch ロジックを使い回します。
  const { origin } = new URL(request.url);
  const fontUrl = new URL("/fonts/NotoSansJP-Bold.ttf", origin).toString();

  try {
    const response = await fetch(fontUrl);
    // 404 や 500 の場合には HTML など別コンテンツが返るため、ok チェックで確実に弾きます。
    if (!response.ok) {
      return null;
    }
    const data = await response.arrayBuffer();
    return { name: "NotoSansJP", data, weight: 700, style: "normal" };
  } catch {
    // Cloudflare Workers 等でネットワーク障害が発生しても全体を落とさず、null を返してデフォルトフォントへフォールバックします。
    return null;
  }
}

// API_BASE 環境変数から絶対パスの画像 URL を安全に生成し、未設定や不正値の場合は null を返します。
const absoluteBackgroundImageUrl = (() => {
  const apiBase = process.env.API_BASE;
  if (!apiBase) {
    return null;
  }
  try {
    // new URL を使ってホスト名とパスを正規化し、確実に絶対パスを構築します。
    return new URL("/search_ogp.png", apiBase).toString();
  } catch {
    return null;
  }
})();

// OGP 専用背景画像を一度だけ読み込み、Base64 Data URL としてキャッシュします。
const baseImageDataUrlPromise: Promise<string | null> = absoluteBackgroundImageUrl
  ? fetch(absoluteBackgroundImageUrl)
    .then((response) => response.arrayBuffer())
    .then((buffer) => `data:image/png;base64,${arrayBufferToBase64(buffer)}`)
    .catch(() => null)
  : Promise.resolve(null);

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// heading クエリはユーザー入力のため、空白除去と過剰な長さのカットオフを丁寧に適用して安全に扱います。
function sanitizeHeading(rawHeading: string | null): string | null {
  if (!rawHeading) {
    return null;
  }
  const trimmed = rawHeading.trim();
  if (!trimmed) {
    return null;
  }
  // 「の検索結果」などの語尾が含まれていてもそのまま扱い、純粋に長さ制限のみ適用します。
  return trimmed.length > headingInputHardLimit ? trimmed.slice(0, headingInputHardLimit) : trimmed;
}

export async function GET(request: Request) {
  // OGP 画像生成時に渡された heading を整形し、検索クエリやチャンネル名を優先的に表示します。
  const heading = sanitizeHeading(new URL(request.url).searchParams.get("heading"));
  // 外部で「ネタ動画」などを含めて渡す前提となったため、見出しは受け取った文字列を丁寧に整形したもののみを表示します。
  const headingForDisplay = heading ? clampHeadingText(heading) : null;

  // headingがない場合はデフォルト画像へリダイレクトします。
  if (!headingForDisplay) {
    const { origin } = new URL(request.url);
    const defaultImageUrl = new URL("/ogp.png", origin).toString();
    return Response.redirect(defaultImageUrl, 302);
  }

  // heading が 1 行に収まるかどうかを概算し、1 行なら中央寄せにするためのフラグを丁寧に管理します。
  const isLikelySingleLineHeading = Boolean(
    headingForDisplay && headingForDisplay.length <= approximateCharsPerLine,
  );
  const backgroundImageUrl = (await baseImageDataUrlPromise) ?? "";
  // リクエスト毎に current origin からフォントを取得し、404 やネットワーク失敗時はデフォルトフォントへフォールバックさせます。
  const notoBold = await loadBoldFont(request);
  const fonts: OgFontOption[] = notoBold ? [notoBold] : [];

  // ImageResponse 生成後に手動で Content-Type を指定し、旧来の export に頼らずレスポンスヘッダーを調整します。
  // フォントが 1 つも読み込めない場合は ImageResponse 上のデフォルトフォントに任せ、空配列を渡して失敗しないよう制御します。
  const imageResponse = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#000",
          backgroundImage: `url(${backgroundImageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          color: "#f8fafc",
          // ImageResponse で読み込むフォント名と CSS 側の font-family 名称をきちんと揃えます。
          fontFamily: fonts.length > 0 ? "NotoSansJP" : "sans-serif",
        }}
      >
        <div
          style={{
            width: textMaxWidth,
            maxWidth: textMaxWidth,
            // 1 行で収まる場合は中央寄せ、それ以外は左寄せにします。
            textAlign: isLikelySingleLineHeading ? "center" : "left",
            fontSize: headingFontSize,
            lineHeight: headingLineHeight,
            color: "#ffffff",
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
            display: "flex",
            flexDirection: "column",
            alignItems: isLikelySingleLineHeading ? "center" : "flex-start",
            justifyContent: isLikelySingleLineHeading ? "center" : "flex-start",
          }}
        >
          {/* heading 単体で高さ制約内に収まるよう、flex wrap + 文字数制限で丁寧にレイアウトします。 */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              overflow: "hidden",
              maxHeight: textMaxHeight,
              // heading テキストのベースライン位置がずれないよう baseline を指定し、視認性を高めます。
              alignItems: "baseline",
              justifyContent: isLikelySingleLineHeading ? "center" : "flex-start",
            }}
          >
            <span
              style={{
                wordBreak: "break-word",
                fontWeight: 700,
              }}
            >
              {headingForDisplay}
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      // フォントが 1 つも読み込めなかった場合は fonts オプションを省略し、ImageResponse のデフォルトフォントで破綻しないよう制御します。
      ...(fonts.length > 0 ? { fonts } : {}),
    },
  );

  // 生成されたレスポンスのヘッダーに適切な MIME タイプを設定します。
  imageResponse.headers.set("Content-Type", contentType);

  return imageResponse;
}
