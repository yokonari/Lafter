import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
// Next.js の通常の Route では size や contentType を export せず、ローカル定数として扱います。
const size = {
  width: 1200,
  height: 630,
} as const;
const contentType = "image/png" as const;
// テキスト領域の最大幅・最大高さを定数化し、複数箇所で共有して制約を統一します。
const textMaxWidth = 1000;
const textMaxHeight = 400;
const headingFontSize = 60;
const headingLineHeight = 1.4;
const headingSuffix = " のネタ動画";
const approximateCharsPerLine = Math.max(10, Math.floor(textMaxWidth / (headingFontSize * 0.9)));
const headingLineClamp = Math.max(1, Math.floor(textMaxHeight / (headingFontSize * headingLineHeight)));
const headingMaxCharacters = headingLineClamp * approximateCharsPerLine;
const headingInputHardLimit = headingMaxCharacters * 2;

function clampHeadingText(text: string): string {
  if (text.length <= headingMaxCharacters - headingSuffix.length) {
    return text;
  }
  const clampTarget = Math.max(1, headingMaxCharacters - headingSuffix.length - 1);
  return `${text.slice(0, clampTarget)}…`;
}

// ImageResponse 向けに太字と通常ウェイトのフォントを先読みしておき、各リクエストで await できるよう Promise を共有します。
type OgFontOption = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };
// フォントディレクトリを一度決め打ちし、追加のファイルがあっても join で安全に参照できるよう整理します。
const fontsDirectory = path.join(process.cwd(), "public", "fonts");

// 文字列で受け取ったフォントファイル名を public/fonts から読み出し、ArrayBuffer として返します。
const readFont = (fileName: string) =>
  readFile(path.join(fontsDirectory, fileName))
    .then((buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
    .catch(() => null);

// 通常ウェイトのフォントを読み込み、失敗時は null を返して ImageResponse 側でフォールバックさせます。
const notoSansJpRegularPromise = readFont("NotoSansJP-Regular.ttf");
// 太字ウェイトも同様に読み込み、ヘッディングの強調表示が確実に行われるようにします。
const notoSansJpBoldPromise = readFont("NotoSansJP-Bold.ttf");

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
  return trimmed.length > headingInputHardLimit ? trimmed.slice(0, headingInputHardLimit) : trimmed;
}

export async function GET(request: Request) {
  // OGP 画像生成時に渡された heading を整形し、検索クエリやチャンネル名を優先的に表示します。
  const heading = sanitizeHeading(new URL(request.url).searchParams.get("heading"));
  const headingForDisplay = heading ? clampHeadingText(heading) : null;
  const backgroundImageUrl = (await baseImageDataUrlPromise) ?? "";
  // 太字と通常ウェイトのフォントをまとめて読み込み、ImageResponse fonts オプションで再利用します。
  const [notoRegular, notoBold] = await Promise.all([notoSansJpRegularPromise, notoSansJpBoldPromise]);
  const fonts: OgFontOption[] = [];
  if (notoRegular) {
    fonts.push({ name: "NotoSansJP", data: notoRegular, weight: 400, style: "normal" });
  }
  if (notoBold) {
    fonts.push({ name: "NotoSansJP", data: notoBold, weight: 700, style: "normal" });
  }

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
          fontFamily: fonts.length > 0 ? "NotoSansJP" : "'Noto Sans JP', 'Hiragino Sans', 'Noto Sans', sans-serif",
        }}
      >
        {headingForDisplay ? (
          <div
            style={{
              width: textMaxWidth,
              maxWidth: textMaxWidth,
              textAlign: "left",
              fontSize: headingFontSize,
              lineHeight: headingLineHeight,
              color: "#ffffff",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "flex-start",
            }}
          >
            {/* heading と「のネタ動画」を同じ行で描画しつつ、flex wrap + 文字数制限で高さ 400px に収めます。 */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                overflow: "hidden",
                maxHeight: textMaxHeight,
                // heading テキストとサフィックスを同じ行のベースラインに合わせ、縦方向にずれが出ないよう baseline を指定します。
                alignItems: "baseline",
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
              <span
                style={{
                  fontSize: 40,
                  wordBreak: "keep-all",
                  fontWeight: 400,
                }}
              >
                {headingSuffix}
              </span>
            </div>
          </div>
        ) : (
          <div
            style={{
              width: textMaxWidth,
              maxWidth: textMaxWidth,
              textAlign: "left",
              fontSize: headingFontSize,
              fontWeight: 700,
              lineHeight: headingLineHeight,
              color: "#ffffff",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              overflow: "hidden",
              maxHeight: textMaxHeight,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "center",
            }}
          >
            Lafter でネタ動画を探す
          </div>
        )}
      </div>
    ),
    {
      ...size,
      ...(fonts.length > 0 ? { fonts } : {}),
    },
  );

  // 生成されたレスポンスのヘッダーに適切な MIME タイプを設定します。
  imageResponse.headers.set("Content-Type", contentType);

  return imageResponse;
}
