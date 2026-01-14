import type { Metadata } from "next";

export type PopularPeriod = "month" | "year" | "all";
export type PopularSort = "views" | "likes";

// 人気ページで使うラベルと文言を集約し、UIとSEOで統一します。
export const POPULAR_PERIOD_LABELS: Record<PopularPeriod, string> = {
  month: "直近1ヶ月",
  year: "直近1年",
  all: "全期間",
};

export const POPULAR_SORT_SEO_PHRASES: Record<PopularSort, string> = {
  views: "再生数が多い",
  likes: "高評価が多い",
};

export const POPULAR_DESCRIPTION_SUFFIX =
  "お笑い芸人の公式YouTubeチャンネルから、漫才・コントなどのネタ動画をまとめています。";

// 人気ページのSEO向けタイトル/説明を統一生成します。
export function buildPopularSeoMetadata(
  periodParam?: string,
  sortParam?: string,
): { title: string; description: string } {
  const period: PopularPeriod =
    periodParam === "month" || periodParam === "year" || periodParam === "all" ? periodParam : "month";
  const sort: PopularSort = sortParam === "views" || sortParam === "likes" ? sortParam : "views";
  const periodLabel = POPULAR_PERIOD_LABELS[period];
  const phrase = POPULAR_SORT_SEO_PHRASES[sort];
  // 全期間だけは「公開された中で」を外して自然な表現にします。
  const periodPrefix = period === "all" ? `${periodLabel}で` : `${periodLabel}に公開された`;
  const title = `${periodPrefix}${phrase}お笑いネタ動画一覧｜公式チャンネルのみ`;
  const description = `${periodPrefix}${phrase}公式お笑いネタ動画を一覧で紹介します。${POPULAR_DESCRIPTION_SUFFIX}`;

  return { title, description };
}
