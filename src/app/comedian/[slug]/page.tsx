import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { UserHome } from "@/components/user/UserHome";
import { getDB } from "@/lib/db";
import { ArtistRepository } from "@/lib/repositories/artistRepository";
import { AgencyRepository } from "@/lib/repositories/agencyRepository";
import { MediaRepository } from "@/lib/repositories/mediaRepository";
import type { ArtistWithAgency } from "../../../../data/artists/types";

export const dynamic = 'force-dynamic';

async function findArtistBySlug(slug: string): Promise<ArtistWithAgency | null> {
  // データベースから芸人情報を取得します。
  const db = getDB();
  const artistRepo = new ArtistRepository(db);
  return await artistRepo.findBySlug(slug);
}

function buildOgImageUrl(heading: string): string {
  // OGP 画像は動的生成のエンドポイントへ誘導します。
  return `/opengraph-image?heading=${encodeURIComponent(heading)}`;
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const resolvedParams = await params;
  const artist = await findArtistBySlug(resolvedParams.slug);
  if (!artist) {
    return {
      title: "Lafter | お笑いネタ動画検索サイト",
    };
  }

  const title = `${artist.name}の公式ネタ動画一覧 | Lafter`;
  const heading = `${artist.name}の公式ネタ動画一覧`;
  const ogImageUrl = buildOgImageUrl(heading);

  return {
    title,
    alternates: {
      canonical: `https://lafter.day/comedian/${artist.slug}`,
    },
    openGraph: {
      title,
      images: [{ url: ogImageUrl }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      images: [ogImageUrl],
    },
  };
}

export default async function ComedianPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const artist = await findArtistBySlug(resolvedParams.slug);
  if (!artist) {
    notFound();
  }

  // 事務所ラベル、事務所チャンネルID、メディアチャンネルIDを取得
  const db = getDB();
  const agencyRepo = new AgencyRepository(db);
  const mediaRepo = new MediaRepository(db);
  const [agencyLabels, agencyChannelIds, mediaChannelIds] = await Promise.all([
    agencyRepo.getLabels(),
    artist.agencyId ? agencyRepo.getChannelIds(artist.agencyId) : Promise.resolve([]),
    mediaRepo.getAllChannelIds(),
  ]);

  return (
    <Suspense fallback={null}>
      <UserHome
        initialComedian={artist}
        agencyLabels={agencyLabels}
        agencyChannelIds={agencyChannelIds}
        mediaChannelIds={mediaChannelIds}
      />
    </Suspense>
  );
}
