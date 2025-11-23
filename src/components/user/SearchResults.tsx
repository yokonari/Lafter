import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchVideoItems, type VideoItem, type PlaylistItem } from "@/lib/videoService";
import { VideoCard } from "./VideoCard";
import { PlaylistCard } from "./PlaylistCard";
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
  const PAGE_SIZE = 20;
  const FETCH_LIMIT = PAGE_SIZE + 1;

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
      // 新しい検索を開始したら、結果表示の先頭がすぐ見えるよう必ずページ最上部へスクロールします。
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      try {
        const { videos: fetchedVideos, playlists: fetchedPlaylists } = await fetchVideoItems(fetch, {
          query,
          channelId,
          mode,
          // 「最近」「ランダム」モードではプレイリストを除外し、動画のみに絞り込みます。
          includePlaylists: mode ? false : undefined,
          signal: controller.signal,
          // 21件目が存在するかを確かめるため、表示上限より1件多めに取得します。
          limit: FETCH_LIMIT,
          offset: 0,
        });
        if (canceled) return;
        const moreVideosExist = fetchedVideos.length > PAGE_SIZE;
        // ボタン表示用に21件目の有無だけ確認し、表示は20件にそろえます。
        const nextVideos = moreVideosExist ? fetchedVideos.slice(0, PAGE_SIZE) : fetchedVideos;
        const nextPlaylists = fetchedPlaylists.length > PAGE_SIZE ? fetchedPlaylists.slice(0, PAGE_SIZE) : fetchedPlaylists;
        setVideos(nextVideos);
        setPlaylists(nextPlaylists);

        if (channelId) {
          const name = fetchedVideos.find((v) => v.channelName)?.channelName || fetchedPlaylists.find((p) => p.channelName)?.channelName;
          if (name) {
            setFetchedChannelName(name);
          }
        }

        // 21件目がある場合のみ「もっと見る」を表示し、20件ぴったりのときはボタンを隠します。
        setHasMore(moreVideosExist);
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

  const handleLoadMore = async () => {
    if (loadingMore) return;
    // ページング用に続きの動画を丁寧に追加します。
    setLoadingMore(true);
    setError(null);

    try {
      const { videos: fetchedVideos, playlists: fetchedPlaylists } = await fetchVideoItems(fetch, {
        query,
        channelId,
        mode,
        // 初回と同様にモード指定時はプレイリストを取得しないようにします。
        includePlaylists: mode ? false : undefined,
        // 続きの取得でも21件目があるかを判別するため1件多めに要求します。
        limit: FETCH_LIMIT,
        offset: Math.max(videos.length, playlists.length),
      });
      const moreVideosExist = fetchedVideos.length > PAGE_SIZE;
      // 追加入荷も21件目の存在を確認しつつ、画面には20件ずつ丁寧に積み上げます。
      const nextVideos = moreVideosExist ? fetchedVideos.slice(0, PAGE_SIZE) : fetchedVideos;
      const nextPlaylists = fetchedPlaylists.length > PAGE_SIZE ? fetchedPlaylists.slice(0, PAGE_SIZE) : fetchedPlaylists;
      setVideos((prev) => [...prev, ...nextVideos]);
      setPlaylists((prev) => [...prev, ...nextPlaylists]);
      // 続きの読み込みも動画件数だけで上限超過を確認し、不要な「もっと見る」表示を防ぎます。
      setHasMore(moreVideosExist);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const buildTitle = () => {
    if (mode === "new") return "最近";
    if (mode === "random") return "ランダム";
    if (channelId) {
      return fetchedChannelName ? `「${fetchedChannelName}」の検索結果` : "チャンネル内の検索結果";
    }
    if (query) return `「${query}」の検索結果`;
    return "検索結果";
  };

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
        <p className={styles.searchTitle}>
          {buildTitle()}
        </p>
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
        <div className={styles.loadMoreWrap}>
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className={styles.searchLoadMoreButton}
          >
            もっと見る
          </button>
        </div>
      )}
    </div>
  );
}
