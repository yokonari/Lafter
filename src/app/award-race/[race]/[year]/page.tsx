import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { UserHome } from "@/components/user/UserHome";
import { RACE_NAMES, AVAILABLE_YEARS, type RaceType } from "@/../../data/award-races/types";

// 賞レースページも動的レンダリングを強制します。
export const dynamic = "force-dynamic";

type AwardRaceDetailPageProps = {
    params: Promise<{
        race: string;
        year: string;
    }>;
};

// 賞レース名を取得するヘルパー関数
function getRaceName(race: string): string {
    if (race === "m1") return RACE_NAMES.m1;
    if (race === "koc") return RACE_NAMES.koc;
    return "賞レース";
}

export async function generateMetadata(
    { params }: AwardRaceDetailPageProps,
): Promise<Metadata> {
    const resolvedParams = await params;
    const race = resolvedParams.race;
    const year = resolvedParams.year;

    // バリデーション
    if ((race !== "m1" && race !== "koc") || !AVAILABLE_YEARS.includes(parseInt(year, 10))) {
        return {
            title: "賞レース | Lafter",
            description: "お笑い賞レースの動画をチェックできます。お笑い芸人の公式YouTubeチャンネルから、漫才・コントなどのネタ動画だけを検索できるサイト。",
        };
    }

    const raceName = getRaceName(race);
    const title = `${raceName} ${year} 芸人一覧 | Lafter`;
    const description = `${raceName} ${year}年度の出場芸人一覧です。決勝進出者、準決勝進出者、準々決勝進出者の情報をまとめています。お笑い芸人の公式YouTubeチャンネルから、漫才・コントなどのネタ動画だけを検索できるサイト。`;

    // OGP画像のURLを構築
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://lafter.day";
    const ogImageUrl = `${baseUrl}/award-race/${race}/${year}/opengraph-image`;

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: title,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [ogImageUrl],
        },
    };
}

export default async function AwardRaceDetailPage({ params }: AwardRaceDetailPageProps) {
    const resolvedParams = await params;
    const race = resolvedParams.race;
    const year = resolvedParams.year;

    // バリデーション: 無効なrace/yearの場合はデフォルトにリダイレクト
    if ((race !== "m1" && race !== "koc") || !AVAILABLE_YEARS.includes(parseInt(year, 10))) {
        redirect("/award-race/m1/2025");
    }

    return (
        <Suspense fallback={null}>
            <UserHome initialMode="award-race" initialRace={race as RaceType} initialYear={parseInt(year, 10)} />
        </Suspense>
    );
}
