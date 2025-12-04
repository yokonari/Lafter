import { ImageResponse } from "next/og";
// Next.js の通常の Route では size や contentType を export せず、ローカル定数として扱います。
const size = {
  width: 1200,
  height: 630,
} as const;
const contentType = "image/png" as const;

// OGP 専用背景画像を一度だけ読み込み、Base64 Data URL としてキャッシュします。
const baseImageDataUrlPromise: Promise<string | null> = fetch(
  new URL("../../../public/search_ogp.png", import.meta.url),
)
  .then((response) => response.arrayBuffer())
  .then((buffer) => `data:image/png;base64,${arrayBufferToBase64(buffer)}`)
  .catch(() => null);

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// heading クエリはユーザー入力のため、空白除去や長さ制限を丁寧に適用して安全に扱います。
function sanitizeHeading(rawHeading: string | null): string | null {
  if (!rawHeading) {
    return null;
  }
  const trimmed = rawHeading.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length > 40 ? `${trimmed.slice(0, 39)}…` : trimmed;
}

export async function GET(request: Request) {
  // OGP 画像生成時に渡された heading を整形し、検索クエリやチャンネル名を優先的に表示します。
  const heading = sanitizeHeading(new URL(request.url).searchParams.get("heading"));
  const backgroundImageUrl = (await baseImageDataUrlPromise) ?? "";

  // ImageResponse 生成後に手動で Content-Type を指定し、旧来の export に頼らずレスポンスヘッダーを調整します。
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
          fontFamily: "'Noto Sans JP', 'Hiragino Sans', 'Noto Sans', sans-serif",
        }}
      >
        {heading ? (
          <div
            style={{
              width: 630,
              maxWidth: 630,
              textAlign: "left",
              fontSize: 60,
              // fontWeight: "bold",
              lineHeight: 1.4,
              color: "#ffffff",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "flex-start",
              alignItems: "center",
              gap: 0,
            }}
          >
            {/* heading と「のネタ動画」を同じ行で描画しつつ、自動改行は flexWrap に任せます。 */}
            <span
              style={{
                wordBreak: "break-word",
              }}
            >
              {heading}
            </span>
            <span
              style={{
                fontSize: 40,
                wordBreak: "keep-all",
              }}
            >
              {" のネタ動画"}
            </span>
          </div>
        ) : (
          <div
            style={{
              width: 630,
              maxWidth: 630,
              textAlign: "left",
              fontSize: 60,
              fontWeight: 500,
              lineHeight: 1.4,
              color: "#ffffff",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
            }}
          >
            Lafter でネタ動画を探す
          </div>
        )}
      </div>
    ),
    {
      ...size,
    },
  );

  // 生成されたレスポンスのヘッダーに適切な MIME タイプを設定します。
  imageResponse.headers.set("Content-Type", contentType);

  return imageResponse;
}
