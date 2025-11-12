'use client';

'use client';

import { useEffect, useState } from "react";
import { fetchVideoItems, type VideoItem } from "@/lib/videoService";
import { VideoCard } from "./VideoCard";

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
    <div className="mx-auto max-w-6xl px-4 py-8">
      {(newLoading || randomLoading) && (
        <p className="mb-6 text-sm text-slate-500">
          現在のおすすめ動画を読み込んでいます…
        </p>
      )}

      {(newError || randomError) && (
        <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {newError ?? randomError}
        </p>
      )}

      {/* 新着動画セクション */}
      <section className="mb-12">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-slate-900">新着ネタ動画</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
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
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-slate-900">ランダム動画</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
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
