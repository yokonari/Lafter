import { useEffect, useMemo, useState } from "react";
import { fetchVideoItems, type VideoItem } from "@/lib/videoService";
import { VideoCard } from "./VideoCard";

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
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">
          「{query}」の検索結果
        </h1>
        <p className="text-sm text-slate-500">
          {results.length}件の結果が見つかりました
        </p>
      </div>

      {loading && (
        <p className="mb-6 text-sm text-slate-500">
          検索結果を読み込んでいます…
        </p>
      )}

      {error && (
        <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {displayedResults.map((video) => (
          <VideoCard key={video.id} video={video} onSelect={onVideoSelect} />
        ))}
      </div>

      {hasMore && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() =>
              setVisibleCount((prev) =>
                Math.min(prev + 20, results.length),
              )
            }
            className="inline-flex items-center rounded-full border border-slate-300 px-6 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            もっと見る（残り{results.length - visibleCount}件）
          </button>
        </div>
      )}
    </div>
  );
}
