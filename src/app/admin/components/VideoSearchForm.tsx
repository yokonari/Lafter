"use client";

import { FormEvent, useState } from "react";
import type { AdminVideo } from "../videos/page";

type VideoSearchFormProps = {
  onResults: (items: AdminVideo[], meta: { hasNext: boolean }) => void;
  onReset: () => void;
};

export function VideoSearchForm({ onResults, onReset }: VideoSearchFormProps) {
  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = keyword.trim();
    if (!trimmed) {
      setMessage("検索ワードを入力してください。");
      onResults([], { hasNext: false });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const searchParams = new URLSearchParams();
      searchParams.set("q", trimmed);
      searchParams.set("page", "1");

      const response = await fetch(`/api/admin/videos?${searchParams.toString()}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        setMessage("検索に失敗しました。再度お試しください。");
        onResults([], { hasNext: false });
        return;
      }
      const payload = (await response.json()) as {
        videos?: AdminVideo[];
        hasNext?: boolean;
      };
      const items = Array.isArray(payload.videos) ? payload.videos : [];
      onResults(items, { hasNext: Boolean(payload.hasNext) });
      setMessage(items.length === 0 ? "該当する動画が見つかりませんでした。" : null);
    } catch (error) {
      const fallback =
        error instanceof Error ? error.message : "検索中に予期せぬエラーが発生しました。";
      setMessage(fallback);
      onResults([], { hasNext: false });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setKeyword("");
    setMessage(null);
    onReset();
  };

  return (
    <section>
      <form onSubmit={handleSubmit}>
        <div className="relative flex-1 text-sm text-slate-600">
          <label className="sr-only" htmlFor="video-search-input">
            動画タイトルで検索
          </label>
          <input
            id="video-search-input"
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="動画タイトルで検索"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          {keyword ? (
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-60"
              aria-label="検索欄をクリア"
            >
              ×
            </button>
          ) : null}
        </div>
      </form>
      {message ? (
        <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {message}
        </p>
      ) : null}
    </section>
  );
}
