'use client';

import { ArrowUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import styles from "./userTheme.module.scss";

export function ScrollTopButton() {
  // ボタンが押されたらページ最上部へスムーズスクロールします。window が無い環境も想定してチェック。
  const handleClick = useCallback(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ボタンを表示するかどうかを管理します。初期値は非表示です。
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // スクロール量が 0 より大きいときだけボタンを出すシンプルな条件です。
    const handler = () => {
      setVisible(window.scrollY > 0);
    };
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={styles.scrollTopButton}
      aria-label="ページ上部へ移動"
    >
      <ArrowUp aria-hidden="true" className={styles.scrollTopIcon} size={24} />
    </button>
  );
}
