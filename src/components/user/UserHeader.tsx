import { ChangeEvent, KeyboardEvent } from "react";

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
    <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-4 py-4">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-2"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white">
            <PlayGlyph />
          </span>
          <span className="text-xl font-semibold text-red-600">Lafter</span>
        </button>

        <div className="flex-1 max-w-2xl">
          {/* サンプルと同等の見た目になるよう入力フィールドをシンプルに整形 */}
          <input
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="動画を検索..."
            className="h-11 w-full rounded-full border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-100"
          />
        </div>
      </div>
    </header>
  );
}

function PlayGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-5 w-5"
      fill="currentColor"
    >
      <path d="M6 4l12 8-12 8z" />
    </svg>
  );
}
