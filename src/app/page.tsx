import type { Metadata, ResolvingMetadata } from "next";
import { Suspense } from "react";
import { fetchVideoItems } from "@/lib/videoService";
import { UserHome } from "@/components/user/UserHome";

// 検索クエリごとに OGP を生成してシェア時にも反映させるため、常に動的レンダリングを強制します。
export const dynamic = "force-dynamic";

const BASE_TITLE = "Lafter | ネタ動画検索アプリ";
const BASE_DESCRIPTION =
  "お笑い芸人の公式YouTubeチャンネルから、漫才・コントなどのネタ動画だけを検索できるアプリ。";

type SearchMetadataContext = {
  query?: string;
  channelId?: string;
  channelName?: string;
  mode?: "new" | "random";
};

// 検索条件に応じたページ見出しを共通関数で丁寧に生成します。
function buildSearchHeading({ query, channelId, channelName, mode }: SearchMetadataContext): string {
  if (mode === "new") return "最近のネタ動画";
  if (mode === "random") return "ランダムなネタ動画";
  if (channelId) {
    return channelName ? `「${channelName}」のネタ動画` : "特定チャンネルのネタ動画";
  }
  if (query) return `「${query}」のネタ動画`;
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

// OGP 画像にも検索キーワードやチャンネル名を載せるための URL を丁寧に構築します。
function buildSearchImageUrl(heading: string, metadataBase?: URL): string | null {
  if (!heading) {
    return null;
  }
  const params = new URLSearchParams();
  params.set("heading", heading);
  const relativePath = `/opengraph-image?${params.toString()}`;
  if (metadataBase) {
    try {
      return new URL(relativePath, metadataBase).toString();
    } catch {
      // metadataBase が万一不正でも相対パスを返し、少なくともアセット自体は動作します。
    }
  }
  return relativePath;
}

type HomePageProps = {
  searchParams?: Promise<{
    q?: string | string[];
    channelId?: string | string[];
    mode?: string | string[];
  }>;
};

// メタ生成時に API へアクセスするためのベース URL を丁寧に算出します。
function resolveBaseUrl(): string | null {
  // まず API_BASE を優先し、末尾のスラッシュを落として常に安定したベース URL を取得します。
  if (typeof process.env.API_BASE === "string" && process.env.API_BASE.trim()) {
    return process.env.API_BASE.trim().replace(/\/$/, "");
  }
  // NEXT_PUBLIC_SITE_URL などは存在しないため、API_BASE が無い場合は null を返し API 呼び出しを行いません。
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

  if (channelId && absoluteFetch) {
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
  } else if (channelId && !absoluteFetch) {
    // API_BASE が無い場合は API 呼び出し自体を控え、既定のタイトル処理に任せます。
  }

  const heading = buildSearchHeading({ query, channelId, channelName, mode });
  const title = heading ? `${heading} | Lafter` : BASE_TITLE;
  const description = buildSearchDescription({ query, channelId, channelName, mode });

  const resolvedParent = await parent;
  const metadataBase = resolvedParent.metadataBase ?? new URL("https://lafter.day");
  const ogImageUrl = buildSearchImageUrl(heading, metadataBase);
  const parentOpenGraph = resolvedParent.openGraph ?? undefined;
  const ogImages = ogImageUrl ? [{ url: ogImageUrl }] : parentOpenGraph?.images;
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
  const twitterImages = ogImageUrl ? [ogImageUrl] : sanitizedTwitter?.images;
  const mergedTwitter = sanitizedTwitter
    ? {
        ...sanitizedTwitter,
        title,
        description,
        images: twitterImages,
      }
    : twitterImages
      ? {
          card: "summary_large_image",
          title,
          description,
          images: twitterImages,
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
