"use client";

import { FormEvent, useState } from "react";

export type ChannelSearchResult = {
  id: string;
  name: string;
  url: string;
  status?: number | null;
  keyword?: string | null;
};

type ChannelSearchFormProps = {
  onResults: (items: ChannelSearchResult[], meta: { hasNext: boolean }) => void;
  onReset: () => void;
};

export function ChannelSearchForm({ onResults, onReset }: ChannelSearchFormProps) {
  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 検索語を受け取り、チャンネル検索 API を丁寧に呼び出します。
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
      // 先頭ページのみを検索し、API のページング挙動に丁寧に合わせます。
      searchParams.set("page", "1");

      const response = await fetch(`/api/admin/channels?${searchParams.toString()}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        setMessage("検索に失敗しました。再度お試しください。");
        onResults([], { hasNext: false });
        return;
      }
      const payload = (await response.json()) as {
        channels?: ChannelSearchResult[];
        hasNext?: boolean;
        page?: number;
        limit?: number;
      };
      const items = Array.isArray(payload.channels) ? payload.channels : [];
      onResults(items, { hasNext: Boolean(payload.hasNext) });
      setMessage(items.length === 0 ? "該当するチャンネルが見つかりませんでした。" : null);
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
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
        <label className="flex-1 text-sm text-slate-600">
          <span className="sr-only">チャンネル名で検索</span>
          <input
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="チャンネル名で検索"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-950 disabled:opacity-60"
        >
          {loading ? "検索中…" : "検索"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={loading}
          className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
        >
          クリア
        </button>
      </form>
      {message ? (
        <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {message}
        </p>
      ) : null}
    </section>
  );
}
