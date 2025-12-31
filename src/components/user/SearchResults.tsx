import { ArrowLeft } from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { fetchVideoItems, type VideoItem } from "@/lib/videoService";
import { VideoCard } from "./VideoCard";
import { XShareButton } from "./XShareButton";
import { containsNgWord } from "@/lib/ng-words";
import { AwardRacePage } from "./AwardRacePage";
import styles from "./userTheme.module.scss";



type SearchResultsProps = {
  query: string;
  channelId?: string;
  mode?: "new" | "random" | "popular" | "award-race"; // "popular" と "award-race" を追加
  onVideoSelect: (video: VideoItem) => void;

  onChannelSelect: (channelId: string) => void;
  onBackToTop: () => void;
  initialRace?: "m1" | "koc";
  initialYear?: number;
};

export function SearchResults({
  query,
  channelId,
  mode,
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
  const PAGE_SIZE = 20;

  // URLパラメータから期間とソート順を読み取り、初期値として設定します。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    // 期間パラメータの読み取り(人気モード時のみ)
    if (mode === "popular") {
      const periodParam = params.get("period");
      if (periodParam === "month" || periodParam === "year" || periodParam === "all") {
        setSelectedPeriod(periodParam);
      }
      // 人気モードではsortパラメータを使用します
      const sortParam = params.get("sort");
      if (sortParam === "views" || sortParam === "likes") { // Added "likes"
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
      }
    }


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
    let canceled = false;
    const controller = new AbortController();

    const run = async () => {
      setLoading(true);
      setError(null);
      setVideos([]);
      setFetchedChannelName(undefined);
      setHasMore(false);
      setNextOffset(0);
      // 新しい検索を開始したら、結果表示の先頭がすぐ見えるよう必ずページ最上部へスクロールします。
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      try {
        const { videos: fetchedVideos, hasNext } = await fetchVideoItems(fetch, {
          query,
          channelId,
          mode,
          period: mode === "popular" ? selectedPeriod : undefined, // 人気モード時のみperiodを渡します
          sort: mode === "popular" ? selectedSort : (mode ? undefined : selectedSort), // 人気モード時はsortを渡します

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
  }, [query, channelId, mode, selectedPeriod, selectedSort]); // selectedSortを依存配列に追加

  const handleLoadMore = useCallback(async () => {
    if (loadingMore) return;
    // ページング用に続きの動画を丁寧に追加します。
    setLoadingMore(true);
    setError(null);

    try {
      const { videos: fetchedVideos, hasNext } = await fetchVideoItems(fetch, {
        query,
        channelId,
        mode,
        period: mode === "popular" ? selectedPeriod : undefined, // 人気モード時のみperiodを渡します
        sort: mode === "popular" ? selectedSort : (mode ? undefined : selectedSort), // 人気モード時はsortを渡します

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
  }, [loadingMore, query, channelId, mode, selectedPeriod, selectedSort, nextOffset]); // selectedSortを依存配列に追加

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
    if (mode === "new") return "最近";
    if (mode === "random") return "ランダム";
    if (mode === "popular") return "人気"; // 人気モードを追加
    if (mode === "award-race") return "賞レースから探す"; // 賞レースモードを追加
    if (channelId) {
      return fetchedChannelName ? `「${fetchedChannelName}」の検索結果` : "チャンネル内の検索結果";
    }
    if (query) return `「${query}」の検索結果`;
    return "検索結果";
  };

  // ヘッド要素の動的メタ情報は App Router の generateMetadata で付与するため、ここでは画面表示に専念します。
  const titleText = buildTitle();

  // 検索クエリまたはチャンネル名にNGワードが含まれている場合、または検索結果が0件の場合はシェアボタンを表示しません。
  const hasResults = videos.length > 0;
  const shouldShowShareButton = hasResults && !(
    (query && containsNgWord(query)) ||
    (fetchedChannelName && containsNgWord(fetchedChannelName))
  );

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

  return (
    // 検索結果ページもダークトーンへ合わせ、各状態メッセージの色味を丁寧に調整します。
    <div className={styles.searchContainer}>
      <div className={styles.searchHeader}>
        {/* 一覧画面の冒頭にトップへ戻る導線を設け、ホームへの遷移を丁寧に補助します。 */}
        <div>
          <button
            type="button"
            className={styles.searchBackLink}
            onClick={() => {
              onBackToTop();
              if (typeof window !== "undefined") {
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
          >
            <ArrowLeft aria-hidden="true" size={16} />
            <span>トップへ戻る</span>
          </button>
        </div>
        {/* メインタイトル: 全モードで表示 */}
        <div className={styles.sectionHeadingWrap}>
          <h1 className={styles.searchTitle}>
            {titleText}
          </h1>
        </div>

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
          {mode !== "popular" && shouldShowShareButton && (
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
              {shouldShowShareButton && (
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
