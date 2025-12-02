'use client';

import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchVideoItems, type VideoItem } from "@/lib/videoService";
import { VideoCard } from "./VideoCard";
import styles from "./userTheme.module.scss";

type HomeSectionsProps = {
  onVideoSelect: (video: VideoItem) => void;
  onChannelSelect: (channelId: string) => void;
  onShowNewList: () => void;
  onShowRandomList: () => void;
};

export function HomeSections({
  onVideoSelect,
  onChannelSelect,
  onShowNewList,
  onShowRandomList,
}: HomeSectionsProps) {
  const [newVideos, setNewVideos] = useState<VideoItem[]>([]);
  const [randomVideos, setRandomVideos] = useState<VideoItem[]>([]);
  const [newError, setNewError] = useState<string | null>(null);
  const [randomError, setRandomError] = useState<string | null>(null);
  const [newLoading, setNewLoading] = useState(false);
  const [randomLoading, setRandomLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setNewLoading(true);
    setNewError(null);

    fetchVideoItems(fetch, {
      // トップの「最近」は最新順でシンプルに並べます。
      mode: "new",
      limit: 10,
      includePlaylists: false, // ホームではプレイリストを表示しないため取得を省きます。
      // userHome セクションでは API に isHome=true を伝えてキャッシュ再抽選の10件に限定します。
      isHome: true,
      signal: controller.signal,
    })
      .then(({ videos }) => {
        if (!controller.signal.aborted) {
          setNewVideos(videos);
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
      includePlaylists: false, // ホームではプレイリストを表示しないため取得を省きます。
      // ランダム表示も userHome 扱いのため isHome=true を付与し、サーバ側で丁寧に再シャッフルします。
      isHome: true,
      signal: controller.signal,
    })
      .then(({ videos }) => {
        if (!controller.signal.aborted) {
          setRandomVideos(videos);
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
              <button
                type="button"
                onClick={onShowNewList}
                className={styles.sectionHeadingButton}
              >
                {/* タイトル左にアクセントバーを置き、視線を自然に誘導します。 */}
                <span className={styles.sectionHeadingBar} aria-hidden="true" />
                <h2 className={styles.sectionHeading}>最近</h2>
              </button>
              <button
                type="button"
                onClick={onShowNewList}
                className={styles.sectionMoreButton}
              >
                もっと見る
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
            <div className={styles.sectionGrid}>
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

          {/* セクション間の区切り線で視覚的に区分します。 */}
          <div className={styles.sectionDivider} aria-hidden="true" />

          {/* ランダム動画セクションもデータ取得後に表示します。 */}
          <section>
            <div className={styles.sectionHeadingWrap}>
              <button
                type="button"
                onClick={onShowRandomList}
                className={styles.sectionHeadingButton}
              >
                {/* タイトル左にアクセントバーを置き、視線を自然に誘導します。 */}
                <span className={styles.sectionHeadingBar} aria-hidden="true" />
                <h2 className={styles.sectionHeading}>ランダム</h2>
              </button>
              <button
                type="button"
                onClick={onShowRandomList}
                className={styles.sectionMoreButton}
              >
                もっと見る
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
            <div className={styles.sectionGrid}>
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
