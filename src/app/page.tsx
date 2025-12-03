import type { Metadata, ResolvingMetadata } from "next";
import { Suspense } from "react";
import { fetchVideoItems } from "@/lib/videoService";
import { UserHome } from "@/components/user/UserHome";

const BASE_TITLE = "Lafter | ネタ動画検索アプリ";
const BASE_DESCRIPTION =
  "お笑い芸人の公式YouTubeチャンネルから、漫才・コントなどのネタ動画だけを検索できるサービス。";

type SearchMetadataContext = {
  query?: string;
  channelId?: string;
  channelName?: string;
  mode?: "new" | "random";
};

// 検索条件に応じたページ見出しを共通関数で丁寧に生成します。
function buildSearchHeading({ query, channelId, channelName, mode }: SearchMetadataContext): string {
  if (mode === "new") return "最近";
  if (mode === "random") return "ランダム";
  if (channelId) {
    return channelName ? `「${channelName}」の検索結果` : "チャンネル内の検索結果";
  }
  if (query) return `「${query}」の検索結果`;
  return "";
}

// OG/Twitter の説明も検索条件を踏まえて柔らかく差し替えます。
function buildSearchDescription({ query, channelId, channelName, mode }: SearchMetadataContext): string {
  if (mode === "new") {
    return `最近アップロードされた公式ネタ動画をまとめてチェックできます。${BASE_DESCRIPTION}`;
  }
  if (mode === "random") {
    return `公式ネタ動画からランダムに動画を楽しめます。${BASE_DESCRIPTION}`;
  }
  if (channelId) {
    const target = channelName ? `「${channelName}」` : "特定チャンネル";
    return `${target}のネタ動画を絞り込んで探せます。${BASE_DESCRIPTION}`;
  }
  if (query) {
    return `「${query}」に一致するネタ動画を検索できます。${BASE_DESCRIPTION}`;
  }
  return BASE_DESCRIPTION;
}

type HomePageProps = {
  searchParams?: Promise<{
    q?: string | string[];
    channelId?: string | string[];
    mode?: string | string[];
  }>;
};

// メタ生成時に API へアクセスするためのベース URL を丁寧に算出します。
function resolveBaseUrl(): string {
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  return envUrl ?? "http://localhost:3000";
}

const baseUrl = resolveBaseUrl();

const absoluteFetch: typeof fetch = (input, init) => {
  if (typeof input === "string" && input.startsWith("/")) {
    return fetch(`${baseUrl}${input}`, init);
  }
  return fetch(input, init);
};

// App Router の generateMetadata でタイトルと説明を検索条件に合わせて細やかに更新します。
export async function generateMetadata(
  { searchParams }: HomePageProps,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  // searchParams は Promise になっているため、必ず await してから値を参照します。
  const resolvedParams = searchParams ? await searchParams : {};

  const query = typeof resolvedParams.q === "string" ? resolvedParams.q.trim() : "";
  const channelId =
    typeof resolvedParams.channelId === "string" && resolvedParams.channelId.length > 0
      ? resolvedParams.channelId
      : undefined;
  const rawMode = typeof resolvedParams.mode === "string" ? resolvedParams.mode : undefined;
  const mode = rawMode === "new" || rawMode === "random" ? rawMode : undefined;
  let channelName: string | undefined;

  if (channelId) {
    try {
      // メタ情報用にチャンネル名を取得し、OG タイトルへ丁寧に反映します。
      const { videos, playlists } = await fetchVideoItems(absoluteFetch, {
        channelId,
        limit: 1,
      });
      channelName = videos[0]?.channelName ?? playlists[0]?.channelName ?? undefined;
    } catch {
      // API 取得に失敗してもページ表示は継続し、既定タイトルへフォールバックします。
    }
  }

  const heading = buildSearchHeading({ query, channelId, channelName, mode });
  const title = heading ? `${heading} | Lafter` : BASE_TITLE;
  const description = buildSearchDescription({ query, channelId, channelName, mode });

  const resolvedParent = await parent;
  const parentOpenGraph = resolvedParent.openGraph ?? undefined;
  const mergedOpenGraph = parentOpenGraph
    ? {
        ...parentOpenGraph,
        url: parentOpenGraph.url ?? undefined,
        title,
        description,
      }
    : {
        title,
        description,
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
  const mergedTwitter = sanitizedTwitter
    ? {
        ...sanitizedTwitter,
        title,
        description,
      }
    : undefined;

  return {
    title,
    description,
    openGraph: mergedOpenGraph,
    twitter: mergedTwitter,
  };
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <UserHome />
    </Suspense>
  );
}
