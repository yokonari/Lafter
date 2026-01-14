import type { Metadata } from "next";
import { Suspense } from "react";
import { UserHome } from "@/components/user/UserHome";
import { NEW_PAGE_SEO_TITLE } from "@/lib/newMetadata";

// 最近の動画ページも動的レンダリングを強制します。
export const dynamic = "force-dynamic";

const TITLE = NEW_PAGE_SEO_TITLE;
const OGP_TITLE = "最近のネタ動画 | Lafter"; // OGP用のタイトルは固定で指定する
const DESCRIPTION = "最近アップロードされた公式ネタ動画をまとめてチェックできます。お笑い芸人の公式YouTubeチャンネルから、漫才・コントなどのネタ動画をまとめています。";

// OGP画像のURLを構築
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://lafter.day";
const OG_IMAGE_URL = `${BASE_URL}/opengraph-image?heading=${encodeURIComponent("最近のネタ動画")}`;

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    openGraph: {
        title: OGP_TITLE,
        description: DESCRIPTION,
        images: [OG_IMAGE_URL],
    },
    twitter: {
        card: "summary_large_image",
        title: OGP_TITLE,
        description: DESCRIPTION,
        images: [OG_IMAGE_URL],
    },
};

export default function NewPage() {
    return (
        <Suspense fallback={null}>
            <UserHome initialMode="new" />
        </Suspense>
    );
}
