'use client';

import { ArrowUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import styles from "./userTheme.module.scss";


export function ScrollTopButton() {
  // ボタンを表示するかどうかを管理します。初期値は非表示です。
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(false);

  // ボタンが押されたらページ最上部へスムーズスクロールします。window が無い環境も想定してチェック。
  const scrollToTop = useCallback(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // スクロール量が 0 より大きいときだけボタンを出すシンプルな条件です。
    // また、画面最下部に到達したかどうかも判定します。
    const handler = () => {
      setShowScrollTop(window.scrollY > 0);

      // 画面最下部判定: スクロール位置 + ウィンドウの高さ >= ドキュメント全体の高さ - 余裕分(10px)
      const isBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 10;
      setIsAtBottom(isBottom);
    };
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <button
      onClick={scrollToTop}
      className={`${styles.scrollTopButton} ${showScrollTop ? styles.visible : ''} ${isAtBottom ? styles.atBottom : ''}`}
      aria-label="トップへ戻る"
    >
      <ArrowUp size={24} className={styles.scrollTopIcon} />
    </button>
  );
}
