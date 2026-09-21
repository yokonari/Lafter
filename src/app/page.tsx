import type { Metadata, ResolvingMetadata } from "next";
import { Suspense } from "react";
import { fetchVideoItems } from "@/lib/videoService";
import { UserHome } from "@/components/user/UserHome";
import { containsNgWord } from "@/lib/ng-words";

// 検索クエリごとに OGP を生成してシェア時にも反映させるため、常に動的レンダリングを強制します。
export const dynamic = "force-dynamic";

const BASE_TITLE = "Lafter | お笑いネタ動画検索サイト";
const BASE_DESCRIPTION =
  "お笑い芸人の公式YouTubeチャンネルから、漫才・コントなどのネタ動画だけを検索できるサイト。";

type SearchMetadataContext = {
  query?: string;
  mode?: "new" | "random" | "popular";
};

// 検索条件に応じたページ見出しを共通関数で丁寧に生成します。
// NGワードを含む検索クエリはタイトルに含めません。
function buildSearchHeading({ query, mode }: SearchMetadataContext): string {
  if (mode === "new") return "最近のネタ動画";
  if (mode === "random") return "ランダムなネタ動画";
  if (mode === "popular") return "人気のネタ動画";
  // 検索クエリにNGワードが含まれている場合は表示しない
  if (query && !containsNgWord(query)) return `「${query}」のネタ動画`;
  if (query) return "検索結果"; // NGワードを含む場合は汎用タイトル
  return "";
}

// OG/Twitter の説明も検索条件を踏まえて柔らかく差し替えます。
// NGワードを含む検索クエリは説明に含めません。
function buildSearchDescription({ query, mode }: SearchMetadataContext): string {
  if (mode === "new") {
    return `最近アップロードされた公式ネタ動画をまとめてチェックできます。${BASE_DESCRIPTION}`;
  }
  if (mode === "random") {
    return `公式ネタ動画からランダムに動画を楽しめます。${BASE_DESCRIPTION}`;
  }
  if (mode === "popular") {
    return `人気の高い公式ネタ動画をまとめてチェックできます。${BASE_DESCRIPTION}`;
  }
  // 検索クエリにNGワードが含まれている場合は表示しない
  if (query && !containsNgWord(query)) {
    return `「${query}」に一致するネタ動画を検索できます。${BASE_DESCRIPTION}`;
  }
  if (query) {
    return `検索結果を表示しています。${BASE_DESCRIPTION}`; // NGワードを含む場合は汎用説明
  }
  return BASE_DESCRIPTION;
}

// OGP 画像にも検索キーワードやチャンネル名を載せるための URL を丁寧に構築します。
// NGワードを含む場合は OGP 画像を生成しません。
function buildSearchImageUrl(heading: string, metadataBase?: URL): string | null {
  if (!heading || containsNgWord(heading)) {
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
    channelId?: string | string[]; // リダイレクト用に残す
    mode?: string | string[]; // リダイレクト用に残す
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
  const resolvedParams = searchParams ? await searchParams : {};

  const query = typeof resolvedParams.q === "string" ? resolvedParams.q.trim() : "";

  const heading = buildSearchHeading({ query });
  const title = heading ? `${heading} | Lafter` : BASE_TITLE;
  const description = buildSearchDescription({ query });

  const resolvedParent = await parent;
  const metadataBase = new URL(resolvedParent.metadataBase?.toString() ?? "https://lafter.day");
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

export default async function Home({ searchParams }: HomePageProps) {
  // 古いURL形式からのリダイレクト処理
  const resolvedParams = searchParams ? await searchParams : {};

  // チャンネルIDリダイレクト: ?channelId=... → /channel/{id}
  const channelId = typeof resolvedParams.channelId === "string" && resolvedParams.channelId.length > 0
    ? resolvedParams.channelId
    : undefined;

  if (channelId) {
    const { redirect } = await import("next/navigation");
    redirect(`/channel/${channelId}`);
  }

  // モードリダイレクト: ?mode=... → /{mode}
  const modeParam = typeof resolvedParams.mode === "string" ? resolvedParams.mode : undefined;

  if (modeParam === "new") {
    const { redirect } = await import("next/navigation");
    redirect("/new");
  }

  if (modeParam === "popular") {
    const { redirect } = await import("next/navigation");
    redirect("/popular");
  }

  if (modeParam === "random") {
    const { redirect } = await import("next/navigation");
    redirect("/random");
  }

  if (modeParam === "award-race") {
    const { redirect } = await import("next/navigation");
    redirect("/award-race");
  }

  return (
    <Suspense fallback={null}>
      <UserHome />
    </Suspense>
  );
}
