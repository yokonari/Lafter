import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { UserHome } from "@/components/user/UserHome";
import { getDB } from "@/lib/db";
import { ArtistRepository } from "@/lib/repositories/artistRepository";
import { AgencyRepository } from "@/lib/repositories/agencyRepository";
import { StyleRepository } from "@/lib/repositories/styleRepository";

export const dynamic = 'force-dynamic';

type ArtistListItem = {
  slug: string;
  name: string;
  kana?: string;
  startedOn?: string;
  styles?: string[];
  agencyId: string;
};

export async function generateMetadata(
  { params }: { params: Promise<{ style: string }> },
): Promise<Metadata> {
  const resolvedParams = await params;
  const db = getDB();
  const styleRepo = new StyleRepository(db);
  const styleLabels = await styleRepo.getLabels();
  const styleLabel = styleLabels[resolvedParams.style] ?? resolvedParams.style;
  const title = `${styleLabel}の芸人一覧 | Lafter`;
  const ogImageUrl = `/opengraph-image?heading=${encodeURIComponent(`${styleLabel}の芸人一覧`)}`;

  return {
    title,
    description: `${styleLabel}を得意とする芸人の公式ネタ動画一覧ページへ移動できます。`,
    alternates: {
      canonical: `https://lafter.day/comedian/filter/${resolvedParams.style}`,
    },
    openGraph: {
      title,
      description: `${styleLabel}を得意とする芸人の公式ネタ動画一覧ページへ移動できます。`,
      images: [{ url: ogImageUrl }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: `${styleLabel}を得意とする芸人の公式ネタ動画一覧ページへ移動できます。`,
      images: [ogImageUrl],
    },
  };
}

type PageProps = {
  params: Promise<{ style: string }>;
  searchParams: Promise<{ sort?: string }>;
};

export default async function ComedianStyleFilterPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;

  const db = getDB();
  const artistRepo = new ArtistRepository(db);
  const agencyRepo = new AgencyRepository(db);
  const styleRepo = new StyleRepository(db);

  const styleLabels = await styleRepo.getLabels();
  const styleColors = await styleRepo.getColors();

  // 有効な芸風IDかチェック（"all"は全件表示用に許可）
  if (resolvedParams.style !== "all" && !Object.keys(styleLabels).includes(resolvedParams.style)) {
    notFound();
  }

  const artists = await artistRepo.getAllWithAgency();
  const agencyLabels = await agencyRepo.getLabels();

  const items: ArtistListItem[] = artists.map((artist) => ({
    slug: artist.slug,
    name: artist.name,
    kana: artist.kana,
    startedOn: artist.startedOn,
    styles: artist.styles,
    agencyId: artist.agencyId,
  }));

  // クエリパラメータからソート順を取得
  const params2 = await searchParams;
  const sort = params2.sort;
  const initialCareerSort = sort === "short" || sort === "name" ? sort : "long";

  return (
    <Suspense fallback={null}>
      <UserHome
        initialComedianList={items}
        agencyLabels={agencyLabels}
        styleLabels={styleLabels}
        styleColors={styleColors}
        initialStyleFilter={resolvedParams.style}
        initialCareerSort={initialCareerSort}
      />
    </Suspense>
  );
}
