import { ImageResponse } from "next/og";
import { RACE_NAMES } from "@/../../data/award-races/types";

export const runtime = "nodejs";

const size = {
    width: 1200,
    height: 630,
} as const;

type OgFontOption = { name: string; data: ArrayBuffer; weight: 700; style: "normal" };

async function loadBoldFont(request: Request): Promise<OgFontOption | null> {
    const { origin } = new URL(request.url);
    const fontUrl = new URL("/fonts/NotoSansJP-Bold.ttf", origin).toString();

    try {
        const response = await fetch(fontUrl);
        if (!response.ok) {
            return null;
        }
        const data = await response.arrayBuffer();
        return { name: "NotoSansJP", data, weight: 700, style: "normal" };
    } catch {
        return null;
    }
}

const absoluteBackgroundImageUrl = (() => {
    const apiBase = process.env.API_BASE;
    if (!apiBase) {
        return null;
    }
    try {
        return new URL("/search_ogp.png", apiBase).toString();
    } catch {
        return null;
    }
})();

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

type Props = {
    params: Promise<{
        race: string;
        year: string;
    }>;
};

export async function GET(request: Request, { params }: Props) {
    const resolvedParams = await params;
    const race = resolvedParams.race;
    const year = resolvedParams.year;

    // レース名を取得
    const raceName = race === "m1" ? RACE_NAMES.m1 : race === "koc" ? RACE_NAMES.koc : "賞レース";
    const title = `${raceName} ${year}`;
    const subtitle = "芸人一覧";

    const backgroundImageUrl = (await baseImageDataUrlPromise) ?? "";
    const notoBold = await loadBoldFont(request);
    const fonts: OgFontOption[] = notoBold ? [notoBold] : [];

    const imageResponse = new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#000",
                    backgroundImage: `url(${backgroundImageUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    color: "#f8fafc",
                    fontFamily: fonts.length > 0 ? "NotoSansJP" : "sans-serif",
                    padding: "80px",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                    }}
                >
                    {/* メインタイトル */}
                    <div
                        style={{
                            fontSize: 80,
                            fontWeight: 700,
                            color: "#ffffff",
                            marginBottom: 20,
                        }}
                    >
                        {title}
                    </div>
                    {/* サブタイトル */}
                    <div
                        style={{
                            fontSize: 48,
                            fontWeight: 700,
                            color: "#e2e8f0",
                        }}
                    >
                        {subtitle}
                    </div>
                </div>
            </div>
        ),
        {
            ...size,
            ...(fonts.length > 0 ? { fonts } : {}),
        },
    );

    imageResponse.headers.set("Content-Type", "image/png");

    return imageResponse;
}
