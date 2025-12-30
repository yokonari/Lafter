import type { Metadata, ResolvingMetadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { fetchVideoItems } from "@/lib/videoService";
import { UserHome } from "@/components/user/UserHome";
import { containsNgWord } from "@/lib/ng-words";

// チャンネルページも動的レンダリングを強制し、OGPを適切に生成します。
export const dynamic = "force-dynamic";

const BASE_TITLE = "Lafter | お笑いネタ動画検索サイト";
const BASE_DESCRIPTION =
    "お笑い芸人の公式YouTubeチャンネルから、漫才・コントなどのネタ動画だけを検索できるサイト。";

type ChannelPageProps = {
    params: Promise<{
        id: string;
    }>;
};

// メタ生成時に API へアクセスするためのベース URL を算出します。
function resolveBaseUrl(): string | null {
    if (typeof process.env.API_BASE === "string" && process.env.API_BASE.trim()) {
        return process.env.API_BASE.trim().replace(/\/$/, "");
    }
    return null;
}

const baseUrl = resolveBaseUrl();

const absoluteFetch: typeof fetch | null = baseUrl
    ? (input, init) => {
        if (typeof input === "string" && input.startsWith("/")) {
            return fetch(`${baseUrl}${input}`, init);
        }
        return fetch(input, init);
    }
    : null;

// チャンネル名にNGワードが含まれている場合は表示しない
function buildChannelHeading(channelName?: string): string {
    const safeChannelName = channelName && !containsNgWord(channelName) ? channelName : null;
    return safeChannelName ? `「${safeChannelName}」のネタ動画` : "特定チャンネルのネタ動画";
}

function buildChannelDescription(channelName?: string): string {
    const safeChannelName = channelName && !containsNgWord(channelName) ? channelName : null;
    const target = safeChannelName ? `「${safeChannelName}」` : "特定チャンネル";
    return `${target}のネタ動画を絞り込んで探せます。${BASE_DESCRIPTION}`;
}

// OGP 画像にチャンネル名を載せるための URL を構築します。
// チャンネル名がない場合やNGワードを含む場合はデフォルト画像を使用します。
function buildChannelImageUrl(heading: string, channelName: string | undefined, metadataBase?: URL): string {
    // チャンネル名がない、またはNGワードを含む場合はデフォルト画像を返す
    if (!channelName || containsNgWord(channelName)) {
        const defaultPath = "/ogp.png";
        if (metadataBase) {
            try {
                return new URL(defaultPath, metadataBase).toString();
            } catch {
                // metadataBase が不正でも相対パスを返します。
            }
        }
        return defaultPath;
    }

    // チャンネル名がある場合は動的OGP画像を生成
    const params = new URLSearchParams();
    params.set("heading", heading);
    const relativePath = `/opengraph-image?${params.toString()}`;
    if (metadataBase) {
        try {
            return new URL(relativePath, metadataBase).toString();
        } catch {
            // metadataBase が不正でも相対パスを返します。
        }
    }
    return relativePath;
}

export async function generateMetadata(
    { params }: ChannelPageProps,
    parent: ResolvingMetadata,
): Promise<Metadata> {
    const resolvedParams = await params;
    const channelId = resolvedParams.id;

    // チャンネルIDが無効な場合はデフォルトメタデータを返します。
    if (!channelId || channelId.trim() === "") {
        return {
            title: BASE_TITLE,
            description: BASE_DESCRIPTION,
        };
    }

    let channelName: string | undefined;

    if (absoluteFetch) {
        try {
            // チャンネル名を取得し、OG タイトルへ反映します。
            const { videos, playlists } = await fetchVideoItems(absoluteFetch, {
                channelId,
                limit: 1,
            });
            channelName = videos[0]?.channelName ?? playlists[0]?.channelName ?? undefined;
        } catch {
            // API 取得に失敗してもページ表示は継続します。
        }
    }

    const heading = buildChannelHeading(channelName);
    const title = `${heading} | Lafter`;
    const description = buildChannelDescription(channelName);

    const resolvedParent = await parent;
    const metadataBase = resolvedParent.metadataBase ?? new URL("https://lafter.day");
    const ogImageUrl = buildChannelImageUrl(heading, channelName, metadataBase);
    const parentOpenGraph = resolvedParent.openGraph ?? undefined;
    const ogImages = [{ url: ogImageUrl }];
    const mergedOpenGraph = parentOpenGraph
        ? {
            ...parentOpenGraph,
            url: parentOpenGraph.url ?? undefined,
            title,
            description,
            images: ogImages,
        }
        : {
            title,
            description,
            images: ogImages,
        };

    const parentTwitter = resolvedParent.twitter ?? undefined;
    const sanitizedTwitter = parentTwitter
        ? {
            ...parentTwitter,
            site: parentTwitter.site ?? undefined,
            siteId: parentTwitter.siteId ?? undefined,
            creator: parentTwitter.creator ?? undefined,
            creatorId: parentTwitter.creatorId ?? undefined,
        }
        : undefined;
    const twitterImages = [ogImageUrl];
    const mergedTwitter = sanitizedTwitter
        ? {
            ...sanitizedTwitter,
            title,
            description,
            images: twitterImages,
        }
        : {
            card: "summary_large_image",
            title,
            description,
            images: twitterImages,
        };

    return {
        title,
        description,
        openGraph: mergedOpenGraph,
        twitter: mergedTwitter,
    };
}

export default async function ChannelPage({ params }: ChannelPageProps) {
    const resolvedParams = await params;
    const channelId = resolvedParams.id;

    // チャンネルIDが無効な場合はトップページにリダイレクトします。
    if (!channelId || channelId.trim() === "") {
        redirect("/");
    }

    return (
        <Suspense fallback={null}>
            <UserHome initialChannelId={channelId} />
        </Suspense>
    );
}
