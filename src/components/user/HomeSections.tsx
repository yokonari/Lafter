'use client';

'use client';

import { useEffect, useState } from "react";
import { fetchVideoItems, type VideoItem, type PlaylistItem } from "@/lib/videoService";
import { VideoCard } from "./VideoCard";
import { PlaylistCard } from "./PlaylistCard";
import styles from "./userTheme.module.scss";

type HomeSectionsProps = {
  onVideoSelect: (video: VideoItem) => void;
  onPlaylistSelect: (playlist: PlaylistItem) => void;
  onChannelSelect: (channelName: string) => void;
};

export function HomeSections({
  onVideoSelect,
  onPlaylistSelect,
  onChannelSelect,
}: HomeSectionsProps) {
  const [newVideos, setNewVideos] = useState<VideoItem[]>([]);
  const [newPlaylists, setNewPlaylists] = useState<PlaylistItem[]>([]);
  const [randomVideos, setRandomVideos] = useState<VideoItem[]>([]);
  const [randomPlaylists, setRandomPlaylists] = useState<PlaylistItem[]>([]);
  const [newError, setNewError] = useState<string | null>(null);
  const [randomError, setRandomError] = useState<string | null>(null);
  const [newLoading, setNewLoading] = useState(false);
  const [randomLoading, setRandomLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setNewLoading(true);
    setNewError(null);

    fetchVideoItems(fetch, {
      mode: "new",
      limit: 10,
      includePlaylists: false, // ホーム画面ではプレイリスト取得を省き、動画だけを軽量に取得します。
      signal: controller.signal,
    })
      .then(({ videos, playlists }) => {
        if (!controller.signal.aborted) {
          setNewVideos(videos);
          setNewPlaylists(playlists);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setNewError(err.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setNewLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setRandomLoading(true);
    setRandomError(null);

    fetchVideoItems(fetch, {
      mode: "random",
      limit: 10,
      includePlaylists: false, // ホーム画面ではプレイリスト取得を省きます。
      signal: controller.signal,
    })
      .then(({ videos, playlists }) => {
        if (!controller.signal.aborted) {
          setRandomVideos(videos);
          setRandomPlaylists(playlists);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setRandomError(err.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setRandomLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, []);

  return (
    // セクション全体でも暗めの背景に寄り添うようカラー調整を丁寧に行います。
    // 上下16px（py-4）で呼吸感を確保しつつ、ヘッダー/フッターとのバランスを整えます。
    <div className={styles.sectionContainer}>
      {(newError || randomError) && <p className={styles.errorCard}>{newError ?? randomError}</p>}

      {(newLoading || randomLoading) ? (
        <div className="mt-6 flex justify-center" aria-label="読み込み中" aria-live="polite">
          {/* 読み込み中の状態を視覚的に丁寧に伝えるスピナーです。 */}
          <div className="h-8 w-8 animate-spin rounded-xl bg-[var(--user-accent)]" />
        </div>
      ) : (
        <>
          {/* 新着動画セクションはデータ取得完了後に表示します。 */}
          <section className={styles.section}>
            <div className={styles.sectionHeadingWrap}>
              <h2 className={styles.sectionHeading}>最近</h2>
            </div>
            <div className={styles.sectionGrid}>
              {newPlaylists.map((playlist) => (
                <PlaylistCard
                  key={`new-playlist-${playlist.id}`}
                  playlist={playlist}
                  onSelect={onPlaylistSelect}
                />
              ))}
              {newVideos.map((video) => (
                <VideoCard
                  key={`new-${video.id}`}
                  video={video}
                  onSelect={onVideoSelect}
                  onChannelSelect={onChannelSelect}
                />
              ))}
            </div>
          </section>

          {/* ランダム動画セクションもデータ取得後に表示します。 */}
          <section>
            <div className={styles.sectionHeadingWrap}>
              <h2 className={styles.sectionHeading}>ランダム</h2>
            </div>
            <div className={styles.sectionGrid}>
              {randomPlaylists.map((playlist) => (
                <PlaylistCard
                  key={`random-playlist-${playlist.id}`}
                  playlist={playlist}
                  onSelect={onPlaylistSelect}
                />
              ))}
              {randomVideos.map((video) => (
                <VideoCard
                  key={`random-${video.id}`}
                  video={video}
                  onSelect={onVideoSelect}
                  onChannelSelect={onChannelSelect}
                />
              ))}
            </div>
          </section>
        </>
      )}

    </div>
  );
}
