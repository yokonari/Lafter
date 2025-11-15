'use client';

'use client';

import { useEffect, useState } from "react";
import { fetchVideoItems, type VideoItem } from "@/lib/videoService";
import { VideoCard } from "./VideoCard";
import styles from "./userTheme.module.scss";

type HomeSectionsProps = {
  onVideoSelect: (video: VideoItem) => void;
};

export function HomeSections({ onVideoSelect }: HomeSectionsProps) {
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
      mode: "new",
      limit: 10,
      signal: controller.signal,
    })
      .then((items) => {
        if (!controller.signal.aborted) {
          setNewVideos(items);
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
      signal: controller.signal,
    })
      .then((items) => {
        if (!controller.signal.aborted) {
          setRandomVideos(items);
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
      {(newLoading || randomLoading) && (
        <p className={styles.statusText}>
          現在のおすすめ動画を読み込んでいます…
        </p>
      )}

      {(newError || randomError) && (
        <p className={styles.errorCard}>
          {newError ?? randomError}
        </p>
      )}

      {/* 新着動画セクション */}
      <section className={styles.section}>
        <div className={styles.sectionHeadingWrap}>
          <h2 className={styles.sectionHeading}>最近</h2>
        </div>
        <div className={styles.sectionGrid}>
          {newVideos.map((video) => (
            <VideoCard
              key={`new-${video.id}`}
              video={video}
              onSelect={onVideoSelect}
            />
          ))}
        </div>
      </section>

      {/* ランダム動画セクション */}
      <section>
        <div className={styles.sectionHeadingWrap}>
          <h2 className={styles.sectionHeading}>ランダム</h2>
        </div>
        <div className={styles.sectionGrid}>
          {randomVideos.map((video) => (
            <VideoCard
              key={`random-${video.id}`}
              video={video}
              onSelect={onVideoSelect}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
