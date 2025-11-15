import { useEffect, useMemo, useState } from "react";
import { fetchVideoItems, type VideoItem } from "@/lib/videoService";
import { VideoCard } from "./VideoCard";
import styles from "./userTheme.module.scss";

type SearchResultsProps = {
  query: string;
  onVideoSelect: (video: VideoItem) => void;
};

export function SearchResults({ query, onVideoSelect }: SearchResultsProps) {
  const [results, setResults] = useState<VideoItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    const controller = new AbortController();

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const items = await fetchVideoItems(fetch, {
          query,
          signal: controller.signal,
        });
        if (canceled) return;
        setResults(items);
        setVisibleCount(20);
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
  }, [query]);

  const displayedResults = useMemo(
    () => results.slice(0, visibleCount),
    [results, visibleCount],
  );
  const hasMore = visibleCount < results.length;

  return (
    // 検索結果ページもダークトーンへ合わせ、各状態メッセージの色味を丁寧に調整します。
    <div className={styles.searchContainer}>
      <div className={styles.searchHeader} />

      {loading && (
        <p className={styles.statusText}>検索結果を読み込んでいます…</p>
      )}

      {error && (
        <p className={styles.errorCard}>{error}</p>
      )}

      <div className={styles.searchGrid}>
        {displayedResults.map((video) => (
          <VideoCard key={video.id} video={video} onSelect={onVideoSelect} />
        ))}
      </div>

      {hasMore && (
        <div className={styles.loadMoreWrap}>
          <button
            type="button"
            onClick={() =>
              setVisibleCount((prev) =>
                Math.min(prev + 20, results.length),
              )
            }
            className={styles.loadMoreButton}
          >
            もっと見る（残り{results.length - visibleCount}件）
          </button>
        </div>
      )}
    </div>
  );
}
