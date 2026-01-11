'use client';

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CircleQuestionMark, Search, X } from "lucide-react";
import { ChangeEvent, CompositionEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import styles from "./userTheme.module.scss";

// ... (imports remain same)

type UserHeaderProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: (value: string) => void;
  onReset: () => void;
  // onUsageOpen removed
  history: string[];
  onHistorySelect: (word: string) => void;
  onHistoryDelete: (word: string) => void;
  isMobileSearchOpen: boolean;
  onMobileSearchOpen: () => void;
  onMobileSearchClose: () => void;
};

export function UserHeader({
  query,
  onQueryChange,
  onSearch,
  onReset,
  // onUsageOpen removed
  history,
  onHistorySelect,
  onHistoryDelete,
  isMobileSearchOpen,
  onMobileSearchOpen,
  onMobileSearchClose,
}: UserHeaderProps) {
  const searchAreaRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [localQuery, setLocalQuery] = useState(query);

  useEffect(() => {
    if (!isComposing) {
      setLocalQuery(query);
    }
  }, [query, isComposing]);

  // モバイル判定を行い、ビューポート変更時にも丁寧に追従します。
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
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

  // モバイル検索画面オープン時のスクロールロック
  useEffect(() => {
    if (isMobileSearchOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileSearchOpen]);



  // Enter 押下と検索ボタンで同じロジックを共有する
  const triggerSearch = async (val: string) => {
    const trimmed = val.trim();
    if (trimmed) {
      setIsHistoryOpen(false);
      onMobileSearchClose();
      // サーバー側へ検索ログも送信し、分析に活用できるよう丁寧に記録します。
      onSearch(trimmed);
      // 実行後は入力をブラーしてソフトキーボードを丁寧に閉じます。
      searchInputRef.current?.blur();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isComposing) return;
    if (event.key === "Enter") {
      void triggerSearch(query);
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setLocalQuery(nextValue);
    if (!isComposing) {
      onQueryChange(nextValue);
    }
    setIsHistoryOpen(true);
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
    const nextValue = event.currentTarget.value;
    setIsComposing(false);
    setLocalQuery(nextValue);
    onQueryChange(nextValue);
    setIsHistoryOpen(true);
  };

  const handleHistoryItemSelect = (word: string) => {
    setIsComposing(false);
    setLocalQuery(word);
    onHistorySelect(word);
    setIsHistoryOpen(false);
    onMobileSearchClose();
    searchInputRef.current?.blur();
  };

  // クリアボタンで入力を空にし、再フォーカスさせます。
  const handleClear = () => {
    setIsComposing(false);
    setLocalQuery("");
    onQueryChange("");
    setIsHistoryOpen(false);
    searchInputRef.current?.focus();
  };

  // キーボード操作でもクリアできるよう、Enter/Space を丁寧にハンドリングします。
  const handleClearKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!query.trim()) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsComposing(false);
      setLocalQuery("");
      onQueryChange("");
      setIsHistoryOpen(false);
      searchInputRef.current?.focus();
    }
  };

  // モバイルで検索欄をタップしたとき、モードを切り替えるだけ（フォーカスは維持）
  const handleMobileSearchTrigger = () => {
    if (isMobile && !isMobileSearchOpen) {
      onMobileSearchOpen();
    }
  };

  const handleBack = () => {
    onMobileSearchClose();
    setIsHistoryOpen(false);
    searchInputRef.current?.blur();
  };

  return (
    <>
      {/* ユーザー画面のヘッダーも管理画面と近いダークトーンに揃え、ブランドカラーを丁寧に踏襲します。 */}
      <header className={styles.header}>
        <div
          className={styles.headerInner}
          data-searching={isMobile && isMobileSearchOpen}
        >
          <Link
            href="/"
            className={styles.brandButton} // 見た目はそのまま流用
            aria-label="Lafter（ラフター）- お笑いネタ動画検索サイト"
            aria-hidden={isMobile && isMobileSearchOpen}
            tabIndex={isMobile && isMobileSearchOpen ? -1 : 0}
          >
            {/* h1 は使わず汎用的なブロックで囲み、視覚デザインを変えずに柔軟なロゴ表現へ丁寧に調整します。 */}
            <div className={styles.brandHeading}>
              {/* 画面には出さずに SEO や支援技術へサイト名を丁寧に伝えます。 */}
              <span className="sr-only">Lafter（ラフター）- お笑いネタ動画検索サイト</span>
              {/* 画面幅が狭くなった際も丁寧にアスペクト比を保ったまま縮小させます。 */}
              <Image
                src="/Lafter.png"
                alt="Lafter（ラフター） お笑いネタ動画検索サイト"
                width={195}
                height={49}
                className={styles.brandLogo}
                priority
              />
            </div>
          </Link>

          <button
            type="button"
            className={styles.mobileBackButton}
            onClick={handleBack}
            aria-label="検索を終了して戻る"
            aria-hidden={!isMobileSearchOpen}
            tabIndex={isMobileSearchOpen ? 0 : -1}
          >
            <ArrowLeft size={24} aria-hidden="true" />
          </button>

          <div
            className={styles.searchArea}
            data-has-clear={Boolean(query.trim())}
            ref={searchAreaRef}
          >
            {/* サンプルと同等の見た目になるよう入力フィールドをシンプルに整形 */}
            <Search aria-hidden className={styles.searchIcon} size={18} />
            <input
              type="search"
              value={localQuery}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onFocus={() => {
                setIsHistoryOpen(true);
                handleMobileSearchTrigger();
              }}
              placeholder="芸人名、動画タイトル"
              aria-label="芸人名、動画タイトル"
              className={styles.searchInput}
              ref={searchInputRef}
            />
            {query && (
              <button
                type="button"
                className={styles.searchClear}
                onClick={handleClear}
                onKeyDown={handleClearKeyDown}
                aria-label="検索キーワードをクリア"
              >
                <X aria-hidden="true" className={styles.searchClearIcon} size={18} />
              </button>
            )}
            {/* モバイル検索時は常に履歴コンテナを表示（履歴が空の場合はCSS等で制御可能だが、要望では「履歴が無い場合は表示しなくていい」とあるので length check を入れる） */}
            {isHistoryOpen && history.length > 0 && (
              <div className={styles.searchHistory} role="listbox">
                {/* モバイル検索時のみタイトルを表示するなどの調整が可能だが、一旦シンプルにリストを表示 */}
                <div className={styles.searchHistoryList}>
                  {history.map((item) => (
                    <div key={item} className={styles.searchHistoryItemWrapper}>
                      <button
                        type="button"
                        className={styles.searchHistoryItem}
                        onClick={() => handleHistoryItemSelect(item)}
                      >
                        <Search size={16} aria-hidden="true" className={styles.searchHistoryIcon} />
                        <span className={styles.searchHistoryText}>{item}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.searchHistoryDelete}
                        onClick={(e) => {
                          e.stopPropagation();
                          onHistoryDelete(item);
                          // PCの場合はフォーカス戻すが、モバイルの場合はキーボード閉じたままがいいかも？
                          // いったんフォーカス戻しで統一
                          searchInputRef.current?.focus();
                        }}
                        aria-label={`${item}を履歴から削除`}
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div
            className={styles.headerActions}
            aria-hidden={isMobile && isMobileSearchOpen}
          >
            <Link
              href="/about"
              className={styles.usageButton}
              aria-label="使いかたを開く"
              tabIndex={isMobile && isMobileSearchOpen ? -1 : 0}
            >
              <CircleQuestionMark size={24} aria-hidden="true" />
            </Link>
            <span className={styles.headerSpacer} aria-hidden />
          </div>
        </div>
      </header>
    </>
  );
}
