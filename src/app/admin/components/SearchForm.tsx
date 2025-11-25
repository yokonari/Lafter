"use client";

import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import styles from "../adminTheme.module.scss";

type SearchResultMeta = { hasNext: boolean; totalCount?: number };

type SearchFormProps<T> = {
  title: string;
  placeholder: string;
  ariaLabel: string;
  emptyMessage: string;
  inputId?: string;
  executeSearch: (keyword: string) => Promise<{ items: T[]; hasNext: boolean; totalCount?: number }>;
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
      onResults([], { hasNext: false, totalCount: 0 });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await executeSearch(trimmed);
      onResults(result.items, { hasNext: result.hasNext, totalCount: result.totalCount });
      setMessage(result.items.length === 0 ? emptyMessage : null);
    } catch (error) {
      const fallback =
        error instanceof Error ? error.message : "検索に失敗しました。再度お試しください。";
      setMessage(fallback);
      onResults([], { hasNext: false, totalCount: 0 });
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
    <section className={styles.searchSection}>
      <h3 className="sr-only">{title}</h3>
      <form onSubmit={handleSubmit} className={styles.form}>
        {/* ダークトーンの入力フィールドで統一し、操作時も視認性を保ちます。 */}
        <div className={styles.inputWrapper}>
          <label className="sr-only" htmlFor={inputId}>
            {ariaLabel}
          </label>
          <input
            id={inputId}
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={placeholder}
            className={styles.input}
          />
          {keyword ? (
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className={styles.clearButton}
              aria-label="検索欄をクリア"
            >
              <X aria-hidden="true" size={18} />
            </button>
          ) : null}
        </div>
      </form>
      {message ? (
        <p className={styles.message}>
          {message}
        </p>
      ) : null}
    </section>
  );
}
