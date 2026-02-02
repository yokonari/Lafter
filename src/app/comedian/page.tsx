import type { Metadata } from "next";
import { Suspense } from "react";
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

// OGP 画像は動的生成のエンドポイントへ誘導します。
const ogHeading = "芸人一覧";
const ogImageUrl = `/opengraph-image?heading=${encodeURIComponent(ogHeading)}`;

export const metadata: Metadata = {
  title: "芸人一覧 | Lafter",
  description: "芸人ごとの公式ネタ動画一覧ページへ移動できます。",
  alternates: {
    canonical: "https://lafter.day/comedian",
  },
  openGraph: {
    title: "芸人一覧 | Lafter",
    description: "芸人ごとの公式ネタ動画一覧ページへ移動できます。",
    images: [{ url: ogImageUrl }],
  },
  twitter: {
    card: "summary_large_image",
    title: "芸人一覧 | Lafter",
    description: "芸人ごとの公式ネタ動画一覧ページへ移動できます。",
    images: [ogImageUrl],
  },
};

type PageProps = {
  searchParams: Promise<{ sort?: string }>;
};

export default async function ComedianIndexPage({ searchParams }: PageProps) {
  // データベースから全芸人と事務所・芸風ラベルを取得します。
  const db = getDB();
  const artistRepo = new ArtistRepository(db);
  const agencyRepo = new AgencyRepository(db);
  const styleRepo = new StyleRepository(db);

  const artists = await artistRepo.getAllWithAgency();
  const agencyLabels = await agencyRepo.getLabels();
  const styleLabels = await styleRepo.getLabels();

  // slug と表示名、読み仮名、事務所IDを抽出して一覧に渡します。
  const items: ArtistListItem[] = artists.map((artist) => ({
    slug: artist.slug,
    name: artist.name,
    kana: artist.kana,
    startedOn: artist.startedOn,
    styles: artist.styles,
    agencyId: artist.agencyId,
  }));

  // クエリパラメータからソート順を取得
  const params = await searchParams;
  const sort = params.sort;
  const initialCareerSort = sort === "short" || sort === "name" ? sort : "long";

  return (
    <Suspense fallback={null}>
      <UserHome
        initialComedianList={items}
        agencyLabels={agencyLabels}
        styleLabels={styleLabels}
        initialCareerSort={initialCareerSort}
      />
    </Suspense>
  );
}
