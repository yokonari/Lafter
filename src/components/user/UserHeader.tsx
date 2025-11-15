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
          <input
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="動画を検索..."
            className={styles.searchInput}
          />
        </div>
      </div>
    </header>
  );
}
