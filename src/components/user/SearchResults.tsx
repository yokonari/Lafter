import { ArrowLeft } from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { fetchVideoItems, type VideoItem, type PlaylistItem } from "@/lib/videoService";
import { VideoCard } from "./VideoCard";
import { PlaylistCard } from "./PlaylistCard";
import { XShareButton } from "./XShareButton";
import styles from "./userTheme.module.scss";

type SearchResultsProps = {
  query: string;
  channelId?: string;
  mode?: "new" | "random";
  onVideoSelect: (video: VideoItem) => void;
  onPlaylistSelect: (playlist: PlaylistItem) => void;
  onChannelSelect: (channelId: string) => void;
  onBackToTop: () => void;
};

export function SearchResults({
  query,
  channelId,
  mode,
  onVideoSelect,
  onPlaylistSelect,
  onChannelSelect,
  onBackToTop,
}: SearchResultsProps) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [fetchedChannelName, setFetchedChannelName] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => {
    let canceled = false;
    const controller = new AbortController();

    const run = async () => {
      setLoading(true);
      setError(null);
      setVideos([]);
      setPlaylists([]);
      setFetchedChannelName(undefined);
      setHasMore(false);
      setNextOffset(0);
      // 新しい検索を開始したら、結果表示の先頭がすぐ見えるよう必ずページ最上部へスクロールします。
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      try {
        const {
          videos: fetchedVideos,
          playlists: fetchedPlaylists,
          hasNext,
        } = await fetchVideoItems(fetch, {
          query,
          channelId,
          mode,
          // 「最近」「ランダム」モードではプレイリストを除外し、動画のみに絞り込みます。
          includePlaylists: mode ? false : undefined,
          signal: controller.signal,
          limit: PAGE_SIZE,
          offset: 0,
        });
        if (canceled) return;
        setVideos(fetchedVideos);
        setPlaylists(fetchedPlaylists);

        if (channelId) {
          const name = fetchedVideos.find((v) => v.channelName)?.channelName || fetchedPlaylists.find((p) => p.channelName)?.channelName;
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
  }, [query, channelId, mode]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore) return;
    // ページング用に続きの動画を丁寧に追加します。
    setLoadingMore(true);
    setError(null);

    try {
      const {
        videos: fetchedVideos,
        playlists: fetchedPlaylists,
        hasNext,
      } = await fetchVideoItems(fetch, {
        query,
        channelId,
        mode,
        // 初回と同様にモード指定時はプレイリストを取得しないようにします。
        includePlaylists: mode ? false : undefined,
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      setVideos((prev) => [...prev, ...fetchedVideos]);
      setPlaylists((prev) => [...prev, ...fetchedPlaylists]);
      setHasMore(hasNext);
      setNextOffset((prevOffset) => prevOffset + fetchedVideos.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, query, channelId, mode, nextOffset]);

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
    if (channelId) {
      return fetchedChannelName ? `「${fetchedChannelName}」の検索結果` : "チャンネル内の検索結果";
    }
    if (query) return `「${query}」の検索結果`;
    return "検索結果";
  };

  // ヘッド要素の動的メタ情報は App Router の generateMetadata で付与するため、ここでは画面表示に専念します。
  const titleText = buildTitle();

  return (
    // 検索結果ページもダークトーンへ合わせ、各状態メッセージの色味を丁寧に調整します。
    <div className={styles.searchContainer}>
      <div className={styles.searchHeader}>
        {/* 一覧画面の冒頭にトップへ戻る導線を設け、ホームへの遷移を丁寧に補助します。 */}
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
        {/* メインタイトルはh1へ切り替え、視覚的な見た目は既存スタイルを活用して変化させません。 */}
        <div className={styles.sectionHeadingWrap}>
          <h1 className={styles.searchTitle}>
            {titleText}
          </h1>
          <XShareButton className={styles.footerInlineShareButton} />
        </div>
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
      {!loading && !error && videos.length === 0 && playlists.length === 0 ? (
        <p className={styles.statusText}>検索結果が見つかりませんでした。</p>
      ) : (
        <div className={styles.searchGrid}>
          {playlists.map((playlist) => (
            <PlaylistCard
              key={`playlist-${playlist.id}`}
              playlist={playlist}
              onSelect={onPlaylistSelect}
              onChannelSelect={onChannelSelect}
            />
          ))}
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              onSelect={onVideoSelect}
              onChannelSelect={onChannelSelect}
            />
          ))}
        </div>
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
