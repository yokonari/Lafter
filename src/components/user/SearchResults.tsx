import { useEffect, useState } from "react";
import { fetchVideoItems, type VideoItem, type PlaylistItem } from "@/lib/videoService";
import { VideoCard } from "./VideoCard";
import { PlaylistCard } from "./PlaylistCard";
import styles from "./userTheme.module.scss";

type SearchResultsProps = {
  query: string;
  onVideoSelect: (video: VideoItem) => void;
  onPlaylistSelect: (playlist: PlaylistItem) => void;
};

export function SearchResults({ query, onVideoSelect, onPlaylistSelect }: SearchResultsProps) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 20;

  useEffect(() => {
    let canceled = false;
    const controller = new AbortController();

    const run = async () => {
      setLoading(true);
      setError(null);
      setVideos([]);
      setPlaylists([]);
      setHasMore(false);
      try {
        const { videos: fetchedVideos, playlists: fetchedPlaylists } = await fetchVideoItems(fetch, {
          query,
          signal: controller.signal,
          limit: PAGE_SIZE,
          offset: 0,
        });
        if (canceled) return;
        setVideos(fetchedVideos);
        setPlaylists(fetchedPlaylists);
        setHasMore(fetchedVideos.length === PAGE_SIZE || fetchedPlaylists.length === PAGE_SIZE);
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

  const handleLoadMore = async () => {
    if (loadingMore) return;
    // ページング用に続きの動画を丁寧に追加します。
    setLoadingMore(true);
    setError(null);

    try {
      const { videos: fetchedVideos, playlists: fetchedPlaylists } = await fetchVideoItems(fetch, {
        query,
        limit: PAGE_SIZE,
        offset: Math.max(videos.length, playlists.length),
      });
      setVideos((prev) => [...prev, ...fetchedVideos]);
      setPlaylists((prev) => [...prev, ...fetchedPlaylists]);
      setHasMore(fetchedVideos.length === PAGE_SIZE || fetchedPlaylists.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  };

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

      {/* ヒットがない場合は空メッセージを丁寧に表示します。 */}
      {!loading && !error && videos.length === 0 && playlists.length === 0 ? (
        <p className={styles.statusText}>検索結果が見つかりませんでした。</p>
      ) : (
        <div className={styles.searchGrid}>
          {playlists.map((playlist) => (
            <PlaylistCard key={`playlist-${playlist.id}`} playlist={playlist} onSelect={onPlaylistSelect} />
          ))}
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} onSelect={onVideoSelect} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className={styles.loadMoreWrap}>
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className={styles.loadMoreButton}
          >
            もっと見る
          </button>
        </div>
      )}
    </div>
  );
}
