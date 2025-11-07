"use client";

import { FormEvent, useState } from "react";

type SearchResultMeta = { hasNext: boolean };

type SearchFormProps<T> = {
  title: string;
  placeholder: string;
  ariaLabel: string;
  emptyMessage: string;
  inputId?: string;
  executeSearch: (keyword: string) => Promise<{ items: T[]; hasNext: boolean }>;
  onResults: (items: T[], meta: SearchResultMeta) => void;
  onReset: () => void;
};

export function SearchForm<T>({
  title,
  placeholder,
  ariaLabel,
  emptyMessage,
  inputId = "search-input",
  executeSearch,
  onResults,
  onReset,
}: SearchFormProps<T>) {
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
      const result = await executeSearch(trimmed);
      onResults(result.items, { hasNext: result.hasNext });
      setMessage(result.items.length === 0 ? emptyMessage : null);
    } catch (error) {
      const fallback =
        error instanceof Error ? error.message : "検索に失敗しました。再度お試しください。";
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
          <label className="sr-only" htmlFor={inputId}>
            {ariaLabel}
          </label>
          <input
            id={inputId}
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={placeholder}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          {keyword ? (
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="material-symbols-rounded absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1disabled:opacity-60"
              aria-label="検索欄をクリア"
            >
              close
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
