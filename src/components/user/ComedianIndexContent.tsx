'use client';

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, Link as LinkIcon } from "lucide-react";
import { BackToTopLink } from "./BackToTopLink";
import { XShareButton } from "./XShareButton";
import { STYLE_LABELS } from "@/lib/styleLabels";
import styles from "./userTheme.module.scss";

type ComedianIndexContentProps = {
  artists: { slug: string; name: string; kana?: string; startedOn?: string; styles?: string[]; agencyId: string }[];
  agencyLabels: Record<string, string>;
  onBackToTop: () => void;
};

function calculateCareerYears(startedOn?: string): number | null {
  if (!startedOn) return null;
  // "YYYY" または "YYYY-MM" を想定して年を取り出します。
  const yearPart = startedOn.split("-")[0];
  const startYear = Number(yearPart);
  if (!Number.isFinite(startYear) || startYear <= 0) return null;
  const currentYear = new Date().getFullYear();
  const years = currentYear - startYear + 1;
  return years > 0 ? years : null;
}

export function ComedianIndexContent({ artists, agencyLabels, onBackToTop }: ComedianIndexContentProps) {
  const [careerSort, setCareerSort] = useState<"long" | "short" | "name">("long");
  const [styleFilter, setStyleFilter] = useState<string>("all");
  const [agencyFilter, setAgencyFilter] = useState<string>("all");

  const availableStyles = useMemo(() => {
    // 一覧に含まれる芸風タグを抽出してフィルタ候補に使います。
    const unique = new Set<string>();
    for (const artist of artists) {
      for (const style of artist.styles ?? []) {
        unique.add(style);
      }
    }
    return Array.from(unique);
  }, [artists]);

  const availableAgencies = useMemo(() => {
    // 一覧に含まれる事務所を抽出してフィルタ候補に使います（"other"を除外）。
    const unique = new Set<string>();
    for (const artist of artists) {
      if (artist.agencyId && artist.agencyId !== "other") {
        unique.add(artist.agencyId);
      }
    }
    return Array.from(unique).sort((a, b) => {
      const aName = agencyLabels[a] ?? a;
      const bName = agencyLabels[b] ?? b;
      return aName.localeCompare(bName, "ja");
    });
  }, [artists]);

  const sortedArtists = useMemo(() => {
    // 芸風と事務所で絞り込み、芸歴ソートまたは名前ソートの比較に使う年数を計算します。
    let filteredArtists = artists;

    // 芸風フィルター
    if (styleFilter !== "all") {
      filteredArtists = filteredArtists.filter((artist) =>
        (artist.styles ?? []).includes(styleFilter)
      );
    }

    // 事務所フィルター
    if (agencyFilter !== "all") {
      filteredArtists = filteredArtists.filter((artist) =>
        artist.agencyId === agencyFilter
      );
    }

    const withCareerYears = filteredArtists.map((artist) => ({
      ...artist,
      careerYears: calculateCareerYears(artist.startedOn) ?? 0,
    }));
    const sorted = withCareerYears.sort((a, b) => {
      if (careerSort === "name") {
        // 読み仮名があれば読み仮名でソート、なければ名前でソート
        const aKey = a.kana ?? a.name;
        const bKey = b.kana ?? b.name;
        return aKey.localeCompare(bKey, "ja");
      }
      return careerSort === "long"
        ? b.careerYears - a.careerYears
        : a.careerYears - b.careerYears;
    });
    return sorted;
  }, [artists, careerSort, styleFilter, agencyFilter]);

  return (
    <div className={styles.searchContainer}>
      <div className={styles.searchHeader}>
        <div>
          <div className={styles.searchBackRow}>
            <BackToTopLink onClick={onBackToTop} />
            {/* 芸人一覧から賞レース出場芸人ページへ誘導します。 */}
            <span className={styles.searchBackSeparator}>/</span>
            <Link href="/award-race" className={styles.searchBackLink}>
              賞レース出場芸人
            </Link>
          </div>
        </div>
        <div className={styles.sectionHeadingWrap}>
          <h1 className={styles.searchTitle}>芸人一覧</h1>
        </div>
        <div className={styles.comedianHeaderRow}>
          <div className={`${styles.periodTabs} ${styles.comedianSortGroup} ${styles.comedianTabsRow}`}>
            <button
              type="button"
              className={`${styles.periodTab} ${careerSort === "name" ? styles.periodTabActive : ""}`}
              onClick={() => setCareerSort("name")}
            >
              名前順
            </button>
            <button
              type="button"
              className={`${styles.periodTab} ${careerSort === "long" ? styles.periodTabActive : ""}`}
              onClick={() => setCareerSort("long")}
            >
              活動が長い
            </button>
            <button
              type="button"
              className={`${styles.periodTab} ${careerSort === "short" ? styles.periodTabActive : ""}`}
              onClick={() => setCareerSort("short")}
            >
              活動が短い
            </button>
          </div>
          {availableStyles.length > 0 && (
            <div className={styles.comedianAgencySelectContainer}>
              <select
                value={styleFilter}
                onChange={(e) => setStyleFilter(e.target.value)}
                className={styles.comedianAgencySelect}
                aria-label="芸風で絞り込み"
              >
                <option value="all">すべての芸風</option>
                {availableStyles.map((style) => (
                  <option key={style} value={style}>
                    {STYLE_LABELS[style] ?? style}
                  </option>
                ))}
              </select>
            </div>
          )}
          {availableAgencies.length > 0 && (
            <div className={styles.comedianAgencySelectContainer}>
              <select
                value={agencyFilter}
                onChange={(e) => setAgencyFilter(e.target.value)}
                className={styles.comedianAgencySelect}
                aria-label="事務所で絞り込み"
              >
                <option value="all">すべての事務所</option>
                {availableAgencies.map((agencyId) => (
                  <option key={agencyId} value={agencyId}>
                    {agencyLabels[agencyId] ?? agencyId}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className={styles.searchHeaderShare}>
            <XShareButton className={styles.footerInlineShareButton} />
          </div>
        </div>
      </div>

      <div className={styles.comedianGrid}>
        {/* 芸人一覧はslugごとのリンクとして表示します。 */}
        {sortedArtists.map((artist) => (
          <Link
            key={artist.slug}
            href={`/comedian/${artist.slug}`}
            className={styles.comedianIndexCard}
          >
            {/* 背景色の上に薄い黒レイヤーを重ねるため、内容をラップします。 */}
            <span className={styles.comedianIndexCardContent}>
              <span className={styles.comedianIndexName}>{artist.name}</span>
              <span className={styles.comedianIndexMetaRow}>
                {(() => {
                  const careerYears = calculateCareerYears(artist.startedOn);
                  if (!careerYears) return null;
                  return (
                    <span className={styles.comedianCareerTag}>
                      <Activity size={14} />
                      {careerYears}年
                    </span>
                  );
                })()}
                {Array.isArray(artist.styles) && artist.styles.length > 0 && (
                  <span className={styles.comedianIndexStyleTags}>
                    {artist.styles.map((style) => (
                      <span
                        key={style}
                        className={`${styles.comedianStyleTag} ${styles[`styleTag_${style}`] ?? ""}`}
                      >
                        {STYLE_LABELS[style] ?? style}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              {artist.agencyId && artist.agencyId !== "other" && (
                <span className={styles.comedianAgencyTag}>
                  <LinkIcon size={12} />
                  <span className={styles.comedianAgencyTagText}>
                    {agencyLabels[artist.agencyId] ?? artist.agencyId}
                  </span>
                </span>
              )}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
