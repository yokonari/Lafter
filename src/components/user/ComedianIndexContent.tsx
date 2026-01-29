'use client';

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Activity, Link as LinkIcon } from "lucide-react";
import { BackToTopLink } from "./BackToTopLink";
import { XShareButton } from "./XShareButton";
import { STYLE_LABELS } from "@/lib/styleLabels";
import styles from "./userTheme.module.scss";

type ComedianIndexContentProps = {
  artists: { slug: string; name: string; kana?: string; startedOn?: string; styles?: string[]; agencyId: string }[];
  agencyLabels: Record<string, string>;
  onBackToTop: () => void;
  initialStyleFilter?: string;
  initialAgencyFilter?: string;
  initialCareerSort?: "long" | "short" | "name";
};

// 活動年数を計算します。未来の年の場合は解散扱いとして -1 を返します。
function calculateCareerYears(startedOn?: string): number | null {
  if (!startedOn) return null;
  // "YYYY" または "YYYY-MM" を想定して年を取り出します。
  const yearPart = startedOn.split("-")[0];
  const startYear = Number(yearPart);
  if (!Number.isFinite(startYear) || startYear <= 0) return null;
  const currentYear = new Date().getFullYear();
  // 未来の年の場合は解散扱い（-1）
  if (startYear > currentYear) return -1;
  const years = currentYear - startYear;
  return years > 0 ? years : null;
}

export function ComedianIndexContent({ artists, agencyLabels, onBackToTop, initialStyleFilter, initialAgencyFilter, initialCareerSort }: ComedianIndexContentProps) {
  const router = useRouter();
  const [careerSort, setCareerSort] = useState<"long" | "short" | "name">(initialCareerSort || "long");
  const [styleFilter, setStyleFilter] = useState<string>(initialStyleFilter || "all");
  const [agencyFilter, setAgencyFilter] = useState<string>(initialAgencyFilter || "all");

  // 初期値が変更された場合に状態を更新
  useEffect(() => {
    if (initialStyleFilter !== undefined) {
      setStyleFilter(initialStyleFilter);
    }
  }, [initialStyleFilter]);

  useEffect(() => {
    if (initialAgencyFilter !== undefined) {
      setAgencyFilter(initialAgencyFilter);
    }
  }, [initialAgencyFilter]);

  useEffect(() => {
    if (initialCareerSort !== undefined) {
      setCareerSort(initialCareerSort);
    }
  }, [initialCareerSort]);

  // タイトルを動的に更新
  useEffect(() => {
    if (typeof document === "undefined") return;

    let title = "芸人一覧";
    const parts: string[] = [];

    if (styleFilter !== "all") {
      parts.push(STYLE_LABELS[styleFilter] ?? styleFilter);
    }
    if (agencyFilter !== "all") {
      parts.push(agencyFilter === "other" ? "その他" : (agencyLabels[agencyFilter] ?? agencyFilter));
    }

    if (parts.length > 0) {
      title = `${parts.join(" × ")}の芸人一覧`;
    }

    document.title = `${title} | Lafter`;
  }, [styleFilter, agencyFilter, agencyLabels]);

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
    // 事務所ごとの所属芸人数をカウントします。
    const agencyCounts = new Map<string, number>();
    for (const artist of artists) {
      if (artist.agencyId) {
        agencyCounts.set(artist.agencyId, (agencyCounts.get(artist.agencyId) ?? 0) + 1);
      }
    }
    // 所属芸人数が多い順にソートし、「その他」は常に最後に配置します。
    return Array.from(agencyCounts.keys()).sort((a, b) => {
      // 「その他」を常に最後に配置
      if (a === "other") return 1;
      if (b === "other") return -1;
      // それ以外は所属芸人数でソート
      return (agencyCounts.get(b) ?? 0) - (agencyCounts.get(a) ?? 0);
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
      // 解散（-1）は活動年数ソート時に末尾に配置
      const aIsDisbanded = a.careerYears === -1;
      const bIsDisbanded = b.careerYears === -1;
      if (aIsDisbanded && !bIsDisbanded) return 1;
      if (!aIsDisbanded && bIsDisbanded) return -1;
      if (aIsDisbanded && bIsDisbanded) return 0;
      return careerSort === "long"
        ? b.careerYears - a.careerYears
        : a.careerYears - b.careerYears;
    });
    return sorted;
  }, [artists, careerSort, styleFilter, agencyFilter]);

  // フィルタ変更時にURLを更新（パスベース + クエリパラメータ）
  const updateUrl = (newStyleFilter: string, newAgencyFilter: string, newCareerSort: "long" | "short" | "name") => {
    let newUrl = "/comedian";

    // 芸風が選択されている場合
    if (newStyleFilter !== "all") {
      newUrl += `/filter/${newStyleFilter}`;

      // 芸風と事務所両方が選択されている場合
      if (newAgencyFilter !== "all") {
        newUrl += `/${newAgencyFilter}`;
      }
    } else if (newAgencyFilter !== "all") {
      // 事務所のみの場合
      newUrl += `/filter/all/${newAgencyFilter}`;
    }

    // ソート順をクエリパラメータとして追加（デフォルトの "long" 以外の場合のみ）
    if (newCareerSort !== "long") {
      newUrl += `?sort=${newCareerSort}`;
    }

    router.push(newUrl);
  };

  // 芸風フィルタ変更ハンドラ
  const handleStyleFilterChange = (value: string) => {
    setStyleFilter(value);
    updateUrl(value, agencyFilter, careerSort);
  };

  // 事務所フィルタ変更ハンドラ
  const handleAgencyFilterChange = (value: string) => {
    setAgencyFilter(value);
    updateUrl(styleFilter, value, careerSort);
  };

  // ソート変更ハンドラ
  const handleCareerSortChange = (value: "long" | "short" | "name") => {
    setCareerSort(value);
    updateUrl(styleFilter, agencyFilter, value);
  };

  // ページタイトル用の文字列を生成
  const pageTitle = useMemo(() => {
    const parts: string[] = [];
    // 芸風が「all」でない場合のみ追加
    if (styleFilter !== "all") {
      parts.push(STYLE_LABELS[styleFilter] ?? styleFilter);
    }
    // 事務所が「all」でない場合のみ追加
    if (agencyFilter !== "all") {
      parts.push(agencyFilter === "other" ? "その他" : (agencyLabels[agencyFilter] ?? agencyFilter));
    }
    return parts.length > 0 ? `${parts.join(" × ")}の芸人一覧` : "芸人一覧";
  }, [styleFilter, agencyFilter, agencyLabels]);

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
          <h1 className={styles.searchTitle}>{pageTitle}</h1>
        </div>
        <p className={styles.pageNote}>※このページの情報は 2026年時点のものです。最新の活動状況とは異なる場合があります。</p>
        <div className={styles.comedianHeaderRow}>
          <div className={`${styles.periodTabs} ${styles.comedianSortGroup} ${styles.comedianTabsRow}`}>
            <button
              type="button"
              className={`${styles.periodTab} ${careerSort === "name" ? styles.periodTabActive : ""}`}
              onClick={() => handleCareerSortChange("name")}
            >
              名前順
            </button>
            <button
              type="button"
              className={`${styles.periodTab} ${careerSort === "long" ? styles.periodTabActive : ""}`}
              onClick={() => handleCareerSortChange("long")}
            >
              活動が長い
            </button>
            <button
              type="button"
              className={`${styles.periodTab} ${careerSort === "short" ? styles.periodTabActive : ""}`}
              onClick={() => handleCareerSortChange("short")}
            >
              活動が短い
            </button>
          </div>
          {availableStyles.length > 0 && (
            <div className={styles.comedianAgencySelectContainer}>
              <select
                value={styleFilter}
                onChange={(e) => handleStyleFilterChange(e.target.value)}
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
                onChange={(e) => handleAgencyFilterChange(e.target.value)}
                className={styles.comedianAgencySelect}
                aria-label="事務所で絞り込み"
              >
                <option value="all">すべての事務所</option>
                {availableAgencies.map((agencyId) => (
                  <option key={agencyId} value={agencyId}>
                    {agencyId === "other" ? "その他" : (agencyLabels[agencyId] ?? agencyId)}
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

      {sortedArtists.length === 0 ? (
        <p className={styles.statusText}>該当する芸人が見つかりませんでした。</p>
      ) : (
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
                    if (careerYears === null || careerYears === 0) return null;
                    // 解散（-1）の場合は「解散」と表示
                    if (careerYears === -1) {
                      return (
                        <span className={styles.comedianCareerTag}>
                          解散
                        </span>
                      );
                    }
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
      )}
    </div>
  );
}
