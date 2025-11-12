import { useEffect, useMemo, useState } from "react";
import { fetchVideoItems, type VideoItem } from "@/lib/videoService";
import { VideoCard } from "./VideoCard";

type SearchResultsProps = {
  query: string;
  onVideoSelect: (video: VideoItem) => void;
};

const categoryTabs = [
  { label: "すべて", categoryNumber: 0 },
  { label: "漫才", categoryNumber: 1 },
  { label: "コント", categoryNumber: 2 },
  { label: "その他", categoryNumber: 4 },
] as const;

export function SearchResults({ query, onVideoSelect }: SearchResultsProps) {
  const [results, setResults] = useState<VideoItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<typeof categoryTabs[number]>(
    categoryTabs[0],
  );

  useEffect(() => {
    let canceled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchVideoItems(fetch, {
      query,
      category: activeTab.categoryNumber || undefined,
      signal: controller.signal,
    })
      .then((items) => {
        if (canceled) return;
        setResults(items);
        setVisibleCount(20);
      })
      .catch((err) => {
        if (canceled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!canceled) {
          setLoading(false);
        }
      });

    return () => {
      canceled = true;
      controller.abort();
    };
  }, [query, activeTab]);

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

      {/* カテゴリタブ */}
      <div className="mb-6">
        <div className="inline-flex h-10 items-center rounded-2xl bg-slate-100 p-1">
          {categoryTabs.map((tab) => {
            const isActive = activeTab.label === tab.label;
            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  setVisibleCount(20);
                }}
                className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
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
