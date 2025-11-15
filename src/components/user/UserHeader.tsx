'use client';

import { ChangeEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import styles from "./userTheme.module.scss";

type UserHeaderProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: (value: string) => void;
  onReset: () => void;
};

export function UserHeader({
  query,
  onQueryChange,
  onSearch,
  onReset,
}: UserHeaderProps) {
  const searchAreaRef = useRef<HTMLDivElement | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const HISTORY_KEY = "userSearchHistory";

  // ローカルストレージから検索履歴を丁寧に読み込みます。
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(HISTORY_KEY) : null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHistory(parsed.filter((item): item is string => typeof item === "string"));
        }
      } catch {
        // 破損した場合は無視して再生成します。
      }
    }
  }, []);

  // 履歴パネル外クリックで丁寧に閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | PointerEvent) => {
      if (!searchAreaRef.current) return;
      if (event.target instanceof Node && searchAreaRef.current.contains(event.target)) {
        return;
      }
      setIsHistoryOpen(false);
    };
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, []);

  const persistHistory = (next: string[]) => {
    setHistory(next);
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      // ストレージ書き込み失敗時も UI は継続します。
    }
  };

  // Enter 押下と検索ボタンで同じロジックを共有する
  const triggerSearch = () => {
    const trimmed = query.trim();
    if (trimmed) {
      // 新しい検索語を履歴へ保存し、重複は先頭へ丁寧に寄せます。
      const nextHistory = [trimmed, ...history.filter((item) => item !== trimmed)].slice(0, 10);
      persistHistory(nextHistory);
      setIsHistoryOpen(false);
      onSearch(trimmed);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      triggerSearch();
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onQueryChange(event.target.value);
    setIsHistoryOpen(true);
  };

  const handleHistorySelect = (word: string) => {
    onQueryChange(word);
    setIsHistoryOpen(false);
    onSearch(word);
  };

  return (
    // ユーザー画面のヘッダーも管理画面と近いダークトーンに揃え、ブランドカラーを丁寧に踏襲します。
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <button type="button" onClick={onReset} className={styles.brandButton}>
          <span className={styles.brandLabel}>Lafter</span>
        </button>

        <div className={styles.searchArea} ref={searchAreaRef}>
          {/* サンプルと同等の見た目になるよう入力フィールドをシンプルに整形 */}
          <span className={styles.searchIcon} aria-hidden>
            <SearchGlyph />
          </span>
          <input
            type="search"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsHistoryOpen(true)}
            placeholder="動画を検索..."
            aria-label="動画を検索"
            className={styles.searchInput}
          />
          {isHistoryOpen && (
            <div className={styles.searchHistory} role="listbox">
              <div className={styles.searchHistoryList}>
                {history.length === 0 ? (
                  <div className={styles.searchHistoryEmpty}>検索履歴はまだありません。</div>
                ) : (
                  history.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={styles.searchHistoryItem}
                      onClick={() => handleHistorySelect(item)}
                    >
                      {item}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <span className={styles.headerSpacer} aria-hidden />
      </div>
    </header>
  );
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={styles.searchIcon}>
      <path
        fill="currentColor"
        d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.71.71l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
      />
    </svg>
  );
}
