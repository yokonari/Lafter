'use client';

import { useCallback, useEffect, useState } from "react";

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
      className="fixed bottom-6 right-6 z-50 inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-[var(--user-accent)] text-[var(--user-bg)] shadow-lg transition hover:bg-[var(--user-accent-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--user-accent)]"
      aria-label="ページ上部へ移動"
    >
      <span
        className="material-symbols-rounded text-2xl"
        style={{ fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" }}
        aria-hidden="true"
      >
        arrow_upward
      </span>
    </button>
  );
}
