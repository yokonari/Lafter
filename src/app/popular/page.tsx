import type { Metadata } from "next";
import { Suspense } from "react";
import { UserHome } from "@/components/user/UserHome";
import { buildPopularSeoMetadata, POPULAR_DESCRIPTION_SUFFIX } from "@/lib/popularMetadata";

// 人気の動画ページも動的レンダリングを強制します。
export const dynamic = "force-dynamic";

const OG_TITLE = "人気のネタ動画 | Lafter";
// OGPは固定値のまま運用するため、人気ページ専用の説明文を用意します。
const OG_DESCRIPTION = `人気の高い公式ネタ動画をまとめてチェックできます。${POPULAR_DESCRIPTION_SUFFIX}`;

type PopularPageProps = {
    searchParams?: Promise<{
        period?: string | string[];
        sort?: string | string[];
    }>;
};

// OGP画像のURLを構築
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://lafter.day";
const OG_IMAGE_URL = `${BASE_URL}/opengraph-image?heading=${encodeURIComponent("人気のネタ動画")}`;

export async function generateMetadata({ searchParams }: PopularPageProps): Promise<Metadata> {
    // パラメータを正規化して、人気ページのSEO情報へ反映します。
    const resolvedParams = searchParams ? await searchParams : {};
    const rawPeriod = Array.isArray(resolvedParams.period) ? resolvedParams.period[0] : resolvedParams.period;
    const rawSort = Array.isArray(resolvedParams.sort) ? resolvedParams.sort[0] : resolvedParams.sort;

    const { title, description } = buildPopularSeoMetadata(rawPeriod, rawSort);

    // OGPは固定値を維持し、SEOのみを動的に差し替えます。
    return {
        title,
        description,
        openGraph: {
            title: OG_TITLE,
            description: OG_DESCRIPTION,
            images: [OG_IMAGE_URL],
        },
        twitter: {
            card: "summary_large_image",
            title: OG_TITLE,
            description: OG_DESCRIPTION,
            images: [OG_IMAGE_URL],
        },
    };
}

export default function PopularPage() {
    return (
        <Suspense fallback={null}>
            <UserHome initialMode="popular" />
        </Suspense>
    );
}
