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
  { params }: { params: Promise<{ style: string; agency: string }> },
): Promise<Metadata> {
  const resolvedParams = await params;
  const db = getDB();
  const agencyRepo = new AgencyRepository(db);
  const styleRepo = new StyleRepository(db);
  const agencyLabels = await agencyRepo.getLabels();
  const styleLabels = await styleRepo.getLabels();

  // 芸風が「all」の場合は事務所名のみ、それ以外は「芸風 × 事務所名」の形式
  const agencyLabel = agencyLabels[resolvedParams.agency] ?? resolvedParams.agency;

  let pageTitle: string;
  let ogHeading: string;

  if (resolvedParams.style === "all") {
    // 芸風が「all」の場合は事務所名のみ
    pageTitle = `${agencyLabel}の芸人一覧`;
    ogHeading = `${agencyLabel}の芸人一覧`;
  } else {
    // 芸風が指定されている場合は「芸風 × 事務所名」
    const styleLabel = styleLabels[resolvedParams.style] ?? resolvedParams.style;
    pageTitle = `${styleLabel} × ${agencyLabel}の芸人一覧`;
    ogHeading = `${styleLabel} × ${agencyLabel}の芸人一覧`;
  }

  const title = `${pageTitle} | Lafter`;
  const ogImageUrl = `/opengraph-image?heading=${encodeURIComponent(ogHeading)}`;

  // descriptionも芸風に応じて変更
  const description = resolvedParams.style === "all"
    ? `${agencyLabel}所属の芸人一覧ページです。`
    : `${styleLabels[resolvedParams.style] ?? resolvedParams.style}を得意とする${agencyLabel}所属の芸人一覧ページです。`;

  return {
    title,
    description,
    alternates: {
      canonical: `https://lafter.day/comedian/filter/${resolvedParams.style}/${resolvedParams.agency}`,
    },
    openGraph: {
      title,
      description,
      images: [{ url: ogImageUrl }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

type PageProps = {
  params: Promise<{ style: string; agency: string }>;
  searchParams: Promise<{ sort?: string }>;
};

export default async function ComedianStyleAgencyFilterPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;

  const db = getDB();
  const artistRepo = new ArtistRepository(db);
  const agencyRepo = new AgencyRepository(db);
  const styleRepo = new StyleRepository(db);

  const styleLabels = await styleRepo.getLabels();
  const agencyLabels = await agencyRepo.getLabels();

  // 有効な芸風IDかチェック（"all"も許可）
  if (resolvedParams.style !== "all" && !Object.keys(styleLabels).includes(resolvedParams.style)) {
    notFound();
  }

  // 事務所IDが有効かチェック
  if (!Object.keys(agencyLabels).includes(resolvedParams.agency)) {
    notFound();
  }

  const artists = await artistRepo.getAllWithAgency();

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
        initialStyleFilter={resolvedParams.style === "all" ? undefined : resolvedParams.style}
        initialAgencyFilter={resolvedParams.agency}
        initialCareerSort={initialCareerSort}
      />
    </Suspense>
  );
}
