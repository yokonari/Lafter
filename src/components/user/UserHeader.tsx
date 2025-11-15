import { ChangeEvent, KeyboardEvent } from "react";
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
  // Enter 押下と検索ボタンで同じロジックを共有する
  const triggerSearch = () => {
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      triggerSearch();
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onQueryChange(event.target.value);
  };

  return (
    // ユーザー画面のヘッダーも管理画面と近いダークトーンに揃え、ブランドカラーを丁寧に踏襲します。
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <button type="button" onClick={onReset} className={styles.brandButton}>
          <span className={styles.brandLabel}>Lafter</span>
        </button>

        <div className={styles.searchArea}>
          {/* サンプルと同等の見た目になるよう入力フィールドをシンプルに整形 */}
          <span className={styles.searchIcon} aria-hidden>
            <SearchGlyph />
          </span>
          <input
            type="search"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="動画を検索..."
            aria-label="動画を検索"
            className={styles.searchInput}
          />
        </div>
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
