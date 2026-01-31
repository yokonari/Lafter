import Link from "next/link";
import { useEffect, useState, useRef, useCallback, Fragment } from "react";
import { Activity, Link as LinkIcon } from "lucide-react";
import { fetchVideoItems, type VideoItem } from "@/lib/videoService";
import { VideoCard } from "./VideoCard";
import { BackToTopLink } from "./BackToTopLink";
import { XShareButton } from "./XShareButton";
import { containsNgWord } from "@/lib/ng-words";
import { AwardRacePage } from "./AwardRacePage";
import { buildPopularSeoMetadata } from "@/lib/popularMetadata";
import { NEW_PAGE_SEO_TITLE } from "@/lib/newMetadata";
import { STYLE_LABELS } from "@/lib/styleLabels";
import styles from "./userTheme.module.scss";

function calculateCareerYears(startedOn?: string): number | null {
  // "YYYY" または "YYYY-MM" を想定して年数を計算します。
  if (!startedOn) return null;
  const yearPart = startedOn.split("-")[0];
  const startYear = Number(yearPart);
  if (!Number.isFinite(startYear) || startYear <= 0) return null;
  const currentYear = new Date().getFullYear();
  const years = currentYear - startYear;
  return years > 0 ? years : null;
}

type SearchResultsProps = {
  query: string;
  channelId?: string;
  channelIds?: string[]; // 複数チャンネル指定を受け付けます。
  channelQuery?: string; // 特定チャンネルのキーワード検索を指定します。
  channelIdsForQuery?: string[]; // キーワード検索対象チャンネルを指定します。
  comedianMeta?: { startedOn?: string; styles?: string[]; agencyId?: string }; // 芸人個別ページのタグ表示用です。
  artistSlug?: string; // 芸人個別ページの slug（KV キャッシュ参照用）
  artistMatches?: { slug: string; name: string; matchedAlias?: string }[]; // 芸人名に一致した候補を表示します。
  showComedianListLink?: boolean; // 芸人個別ページのみ芸人一覧への導線を表示します。
  mode?: "new" | "random" | "popular" | "award-race"; // "popular" と "award-race" を追加
  titleOverride?: string; // タイトルを固定したい場合に指定します。
  titleMode?: "default" | "channelName"; // チャンネル名のみを使うタイトルに切り替えます。
  headingLevel?: "h1" | "h2" | "h3"; // 見出しレベルを上書きします。
  headingLinkHref?: string; // 見出しをリンクにしたい場合に指定します。
  showBackLink?: boolean; // 先頭の戻るリンク表示を制御します。
  showShareButton?: boolean; // シェアボタン表示を制御します。
  agencyLabels?: Record<string, string>; // 事務所ID→名前のマッピング
  onVideoSelect: (video: VideoItem) => void;

  onChannelSelect: (channelId: string) => void;
  onBackToTop: () => void;
  initialRace?: "m1" | "koc";
  initialYear?: number;
};

export function SearchResults({
  query,
  channelId,
  channelIds,
  channelQuery,
  channelIdsForQuery,
  comedianMeta,
  artistSlug,
  artistMatches,
  showComedianListLink,
  mode,
  titleOverride,
  titleMode = "default",
  headingLevel,
  headingLinkHref,
  showBackLink = true,
  showShareButton = true,
  agencyLabels = {},
  onVideoSelect,

  onChannelSelect,
  onBackToTop,
  initialRace,
  initialYear,
}: SearchResultsProps) {
  const [videos, setVideos] = useState<VideoItem[]>([]);

  const [fetchedChannelName, setFetchedChannelName] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState<"month" | "year" | "all">("month"); // 期間選択用のStateを追加
  const [selectedSort, setSelectedSort] = useState<"published" | "views" | "likes">("published"); // ソート順選択用のStateを追加
  const isInitialSearchRestore = useRef(true);
  const PAGE_SIZE = 20;
  // 芸人個別ページに表示する芸歴・芸風・事務所タグの判定をまとめます。
  const comedianCareerYears = calculateCareerYears(comedianMeta?.startedOn);
  const comedianStyles = comedianMeta?.styles ?? [];
  const comedianAgencyId = comedianMeta?.agencyId;
  const shouldShowComedianTags = Boolean(comedianCareerYears || comedianStyles.length > 0 || (comedianAgencyId && comedianAgencyId !== "other"));
  // channelIds は順序や重複を整えてから比較・送信します。
  const normalizedChannelIds = (channelIds ?? []).map((id) => id.trim()).filter((id) => id.length > 0);
  const uniqueChannelIds = Array.from(new Set(normalizedChannelIds));
  const channelIdsKey = uniqueChannelIds.join(",");
  // キーワード検索対象のチャンネルIDを正規化します。
  const normalizedChannelIdsForQuery = (channelIdsForQuery ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  const uniqueChannelIdsForQuery = Array.from(new Set(normalizedChannelIdsForQuery));
  const channelIdsForQueryKey = uniqueChannelIdsForQuery.join(",");

  // 人気タブのUI操作に合わせて、クライアント側のタイトルも更新します。
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (mode !== "popular") return;
    const { title } = buildPopularSeoMetadata(selectedPeriod, selectedSort);
    document.title = title;
  }, [mode, selectedPeriod, selectedSort]);

  // URLパラメータから期間とソート順を読み取り、初期値として設定します。
  useEffect(() => {
    if (typeof window === "undefined") return;

    const readUrlParams = () => {
      const params = new URLSearchParams(window.location.search);

      // 期間パラメータの読み取り(人気モード時のみ)
      if (mode === "popular") {
        const periodParam = params.get("period");
        if (periodParam === "month" || periodParam === "year" || periodParam === "all") {
          setSelectedPeriod(periodParam);
        }
        // 人気モードではsortパラメータを使用します
        const sortParam = params.get("sort");
        if (sortParam === "views" || sortParam === "likes") {
          setSelectedSort(sortParam);
        } else {
          // デフォルトは再生数
          setSelectedSort("views");
        }
      } else {
        // その他のモードのソート順パラメータの読み取り
        const sortParam = params.get("sort");
        if (sortParam === "published" || sortParam === "views" || sortParam === "likes") {
          setSelectedSort(sortParam);
        } else {
          // パラメータがない場合はデフォルトの「公開日」を設定
          setSelectedSort("published");
        }
      }
    };

    // 初回読み込み
    readUrlParams();

    // ブラウザバック/フォワード時にURLパラメータを再読み込み
    const handlePopState = () => {
      readUrlParams();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [mode]);

  // 期間変更ハンドラを実装します。
  const handlePeriodChange = useCallback((period: "month" | "year" | "all") => {
    setSelectedPeriod(period);

    // URLパラメータを更新します。
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.set("period", period);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.pushState({}, "", newUrl);
    }
  }, []);

  // ソート順変更ハンドラを実装します。
  const handleSortChange = useCallback((sort: "published" | "views" | "likes") => {
    setSelectedSort(sort);

    // URLパラメータを更新します。
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.set("sort", sort);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.pushState({}, "", newUrl);
    }
  }, []);

  useEffect(() => {
    // 賞レースモード時は動画取得をスキップします。
    if (mode === "award-race") {
      return;
    }

    let canceled = false;
    const controller = new AbortController();

    const run = async () => {
      setLoading(true);
      setError(null);
      setVideos([]);
      setFetchedChannelName(undefined);
      setHasMore(false);
      setNextOffset(0);
      // ブラウザバックでの初回復元時はスクロールを抑止します。
      if (typeof window !== "undefined") {
        const navigationEntry = typeof performance !== "undefined"
          ? (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)
          : undefined;
        const shouldSkipInitial = isInitialSearchRestore.current && navigationEntry?.type === "back_forward";
        if (!shouldSkipInitial) {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        isInitialSearchRestore.current = false;
      }
      try {
        const { videos: fetchedVideos, hasNext } = await fetchVideoItems(fetch, {
          query,
          channelId,
          channelIds: channelId ? undefined : uniqueChannelIds,
          channelQuery,
          channelIdsForQuery: channelId ? undefined : uniqueChannelIdsForQuery,
          mode,
          period: mode === "popular" ? selectedPeriod : undefined, // 人気モード時のみperiodを渡します
          sort: mode === "popular" ? selectedSort : (mode ? undefined : selectedSort), // 人気モード時はsortを渡します
          artistSlug,
          signal: controller.signal,
          limit: PAGE_SIZE,
          offset: 0,
        });
        if (canceled) return;
        setVideos(fetchedVideos);

        if (channelId) {
          const name = fetchedVideos.find((v) => v.channelName)?.channelName;
          if (name) {
            setFetchedChannelName(name);
          }
        }

        setHasMore(hasNext);
        setNextOffset(fetchedVideos.length);
      } catch (err) {
        if (canceled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    };

    run().catch(() => {
      if (!canceled) {
        setLoading(false);
      }
    });

    return () => {
      canceled = true;
      controller.abort();
    };
  }, [query, channelId, channelIdsKey, channelQuery, channelIdsForQueryKey, mode, selectedPeriod, selectedSort, artistSlug]); // artistSlugを依存配列に追加

  const handleLoadMore = useCallback(async () => {
    if (loadingMore) return;
    // ページング用に続きの動画を丁寧に追加します。
    setLoadingMore(true);
    setError(null);

    try {
      const { videos: fetchedVideos, hasNext } = await fetchVideoItems(fetch, {
        query,
        channelId,
        channelIds: channelId ? undefined : uniqueChannelIds,
        channelQuery,
        channelIdsForQuery: channelId ? undefined : uniqueChannelIdsForQuery,
        mode,
        period: mode === "popular" ? selectedPeriod : undefined, // 人気モード時のみperiodを渡します
        sort: mode === "popular" ? selectedSort : (mode ? undefined : selectedSort), // 人気モード時はsortを渡します
        artistSlug,
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      setVideos((prev) => [...prev, ...fetchedVideos]);
      setHasMore(hasNext);
      setNextOffset((prevOffset) => prevOffset + fetchedVideos.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, query, channelId, channelIdsKey, channelQuery, channelIdsForQueryKey, mode, selectedPeriod, selectedSort, artistSlug, nextOffset]); // artistSlugを依存配列に追加

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = observerTarget.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [hasMore, loadingMore, loading, handleLoadMore]);

  const buildTitle = () => {
    if (mode === "new") return "最近のネタ動画";
    if (mode === "random") return "ランダムなネタ動画";
    if (mode === "popular") return "人気のネタ動画"; // 人気モードを追加
    if (channelId) {
      return fetchedChannelName ? `「${fetchedChannelName}」の検索結果` : "チャンネル内の検索結果";
    }
    if (query) return `「${query}」の検索結果`;
    return "検索結果";
  };

  // ヘッド要素の動的メタ情報は App Router の generateMetadata で付与するため、ここでは画面表示に専念します。
  const titleText =
    titleOverride
    ?? (titleMode === "channelName" && channelId
      ? (fetchedChannelName ?? "チャンネル動画")
      : buildTitle());

  // 検索クエリまたはチャンネル名にNGワードが含まれている場合、または検索結果が0件の場合はシェアボタンを表示しません。
  const hasResults = videos.length > 0;
  const shouldShowShareButton = hasResults && !(
    (query && containsNgWord(query)) ||
    (fetchedChannelName && containsNgWord(fetchedChannelName))
  );
  const canShowShareButton = showShareButton && shouldShowShareButton;
  // 検索語に一致した芸人候補がある場合のみ表示対象にします。
  const hasArtistMatches = Boolean(artistMatches && artistMatches.length > 0);

  // 賞レースモード時は専用コンポーネントを表示
  if (mode === "award-race") {
    return (
      <AwardRacePage
        onBackToTop={onBackToTop}
        onComedianSearch={(name) => {
          // 芸人名で検索を実行
          if (typeof window !== "undefined") {
            const params = new URLSearchParams();
            params.set("q", name);
            window.location.href = `/?${params.toString()}`;
          }
        }}
        initialRace={initialRace}
        initialYear={initialYear}
      />
    );
  }

  const isSeoH2Mode = mode === "popular" || mode === "new" || mode === "random";
  const shouldRenderSeoH1 = !titleOverride && !headingLevel && isSeoH2Mode;
  const HeadingTag = headingLevel ?? (shouldRenderSeoH1 ? "h2" : "h1");
  // 検索結果ヘッダーは現在開いていないモードのみを表示します。
  const backLinks = (() => {
    const allModes = [
      { key: "new", label: "最近", href: "/new" },
      { key: "popular", label: "人気", href: "/popular" },
      { key: "random", label: "ランダム", href: "/random" },
    ];
    // 芸人個別ページの場合は芸人一覧へのリンクを追加します。
    if (showComedianListLink) {
      return [{ key: "comedian", label: "芸人一覧", href: "/comedian" }];
    }
    if (mode === "new") return allModes.filter((item) => item.key !== "new");
    if (mode === "popular") return allModes.filter((item) => item.key !== "popular");
    if (mode === "random") return allModes.filter((item) => item.key !== "random");
    return allModes;
  })();
  const srOnlyTitle =
    mode === "popular"
      ? buildPopularSeoMetadata(selectedPeriod, selectedSort).title
      : mode === "new"
        ? NEW_PAGE_SEO_TITLE
        : titleText;

  return (
    // 検索結果ページもダークトーンへ合わせ、各状態メッセージの色味を丁寧に調整します。
    <div className={styles.searchContainer}>
      <div className={styles.searchHeader}>
        {/* 一覧画面の冒頭にトップへ戻る導線を設け、ホームへの遷移を丁寧に補助します。 */}
        {showBackLink && (
          <div className={styles.searchBackRow}>
            <BackToTopLink
              onClick={() => {
                onBackToTop();
                if (typeof window !== "undefined") {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
            />
            {/* トップへ戻るリンクの右側にセクション導線を並べます。 */}
            {backLinks.map((link) => (
              <Fragment key={link.key}>
                <span className={styles.searchBackSeparator}>/</span>
                <Link href={link.href} className={styles.searchBackLink}>
                  {link.label}
                </Link>
              </Fragment>
            ))}
          </div>
        )}
        {/* メインタイトル: 全モードで表示 */}
        <div className={styles.sectionHeadingWrap}>
          {/* 人気・最近・ランダムのみ視覚見出しを h2 に下げます。 */}
          {shouldRenderSeoH1 ? (
            <>
              <h1 className="sr-only">{srOnlyTitle}</h1>
              {headingLinkHref ? (
                <Link href={headingLinkHref} className={styles.sectionHeadingLink}>
                  <HeadingTag className={styles.searchTitle}>{titleText}</HeadingTag>
                </Link>
              ) : (
                <HeadingTag className={styles.searchTitle}>{titleText}</HeadingTag>
              )}
            </>
          ) : (
            headingLinkHref ? (
              <Link href={headingLinkHref} className={styles.sectionHeadingLink}>
                <HeadingTag className={styles.searchTitle}>{titleText}</HeadingTag>
              </Link>
            ) : (
              <HeadingTag className={styles.searchTitle}>{titleText}</HeadingTag>
            )
          )}
        </div>

        {/* 芸人個別ページではタイトル直下に芸歴と芸風タグを並べます。 */}
        {shouldShowComedianTags && (
          <div className={`${styles.comedianMetaRow} ${styles.comedianMetaRowInline}`}>
            {comedianCareerYears && (
              <span className={styles.comedianCareerTag}>
                <Activity size={14} />
                {comedianCareerYears}年
              </span>
            )}
            {comedianStyles.length > 0 && (
              <span className={styles.comedianStyleTags}>
                {comedianStyles.map((style) => (
                  <span
                    key={style}
                    className={`${styles.comedianStyleTag} ${styles[`styleTag_${style}`] ?? ""}`}
                  >
                    {STYLE_LABELS[style] ?? style}
                  </span>
                ))}
              </span>
            )}
            {comedianAgencyId && comedianAgencyId !== "other" && (
              <span className={styles.comedianAgencyTag}>
                <LinkIcon size={12} />
                <span className={styles.comedianAgencyTagText}>
                  {agencyLabels[comedianAgencyId] ?? comedianAgencyId}
                </span>
              </span>
            )}
          </div>
        )}

        {/* タイトル直下の行に芸人名の候補を表示します。 */}
        {hasArtistMatches && (
          <div>
            <div className={styles.artistMatchRow}>
              {/* 芸人名の一致候補をラベル右側に並べて表示します。 */}
              <div className={styles.artistMatchButtons}>
                {artistMatches?.map((artist) => (
                  <Link
                    key={artist.slug}
                    href={`/comedian/${artist.slug}`}
                    className={`${styles.comedianCard} ${styles.artistMatchButton}`}
                  >
                    <span className={styles.comedianCardContent}>
                      <span>
                        {artist.matchedAlias
                          ? `${artist.name}（旧：${artist.matchedAlias}）`
                          : artist.name}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* タイトル下の行にフィルタボタンを配置します。 */}
        {/* NGワードを含む検索時はシェアボタンを非表示にします。 */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          {/* ソート順フィルタボタン: 最近・ランダム・人気モード以外で、かつ検索結果が2件以上の時のみ表示 */}
          {mode !== "random" && mode !== "new" && mode !== "popular" && videos.length >= 2 && (
            <div className={styles.periodTabs} style={{ marginBottom: 0 }}>
              <button
                type="button"
                className={`${styles.periodTab} ${selectedSort === "published" ? styles.periodTabActive : ""}`}
                onClick={() => handleSortChange("published")}
              >
                公開日
              </button>
              <button
                type="button"
                className={`${styles.periodTab} ${selectedSort === "views" ? styles.periodTabActive : ""}`}
                onClick={() => handleSortChange("views")}
              >
                再生数
              </button>
              <button
                type="button"
                className={`${styles.periodTab} ${selectedSort === "likes" ? styles.periodTabActive : ""}`}
                onClick={() => handleSortChange("likes")}
              >
                高評価
              </button>
            </div>
          )}

          {/* 人気モード以外でシェアボタンを表示 */}
          {mode !== "popular" && canShowShareButton && (
            <div className={styles.searchHeaderShare}>
              <XShareButton className={styles.footerInlineShareButton} />
            </div>
          )}
        </div>
        {/* 人気モード時にタブと期間選択タブとシェアボタンを表示します。 */}
        {mode === "popular" && (
          <>
            {/* 賞レース詳細画面と同じスタイルのタブ */}
            <div className={styles.raceTabContainer}>
              <button
                className={`${styles.raceTab} ${selectedSort === "views" ? styles.active : ""}`}
                onClick={() => handleSortChange("views")}
              >
                再生数
              </button>
              <button
                className={`${styles.raceTab} ${selectedSort === "likes" ? styles.active : ""}`}
                onClick={() => handleSortChange("likes")}
              >
                高評価
              </button>
            </div>
            {/* 期間選択タブとシェアボタン */}
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <div className={styles.periodTabs} style={{ marginBottom: 0 }}>
                <button
                  type="button"
                  className={`${styles.periodTab} ${selectedPeriod === "month" ? styles.periodTabActive : ""}`}
                  onClick={() => handlePeriodChange("month")}
                >
                  1ヶ月
                </button>
                <button
                  type="button"
                  className={`${styles.periodTab} ${selectedPeriod === "year" ? styles.periodTabActive : ""}`}
                  onClick={() => handlePeriodChange("year")}
                >
                  1年
                </button>
                <button
                  type="button"
                  className={`${styles.periodTab} ${selectedPeriod === "all" ? styles.periodTabActive : ""}`}
                  onClick={() => handlePeriodChange("all")}
                >
                  累計
                </button>
              </div>
              {canShowShareButton && (
                <div className={styles.searchHeaderShare}>
                  <XShareButton className={styles.footerInlineShareButton} />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {loading && (
        <>
          <p className={styles.statusText}>検索結果を読み込んでいます…</p>
          <div className="mt-6 flex justify-center" aria-label="読み込み中" aria-live="polite">
            {/* 読み込み中の状態を視覚的に丁寧に伝えるスピナーです。 */}
            <div className="animate-spin h-8 w-8 rounded-xl bg-[var(--user-accent)]" />
          </div>
        </>
      )}

      {error && (
        <p className={styles.errorCard}>{error}</p>
      )}

      {/* ヒットがない場合は空メッセージを丁寧に表示します。 */}
      {!loading && !error && videos.length === 0 ? (
        <p className={styles.statusText}>検索結果が見つかりませんでした。</p>
      ) : (
        <>
          {/* 動画グリッド */}
          <div className={styles.searchGrid}>
            {videos.map((video) => {
              // 人気モードまたは検索結果でソート順が再生数/高評価の場合、統計情報を表示
              const displayStat =
                mode === "popular" && (selectedSort === "views" || selectedSort === "likes")
                  ? selectedSort
                  : !mode && (selectedSort === "views" || selectedSort === "likes")
                    ? selectedSort
                    : undefined;

              return (
                <VideoCard
                  key={video.id}
                  video={video}
                  onSelect={onVideoSelect}
                  onChannelSelect={onChannelSelect}
                  displayStat={displayStat}
                />
              );
            })}
          </div>
        </>
      )}

      {hasMore && (
        <div ref={observerTarget} className={styles.loadMoreWrap}>
          {loadingMore && (
            <div className="flex justify-center py-4" aria-label="追加読み込み中" aria-live="polite">
              <div className="animate-spin h-8 w-8 rounded-xl bg-[var(--user-accent)]" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
