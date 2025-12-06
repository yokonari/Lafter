'use client';

import { useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXTwitter } from "@fortawesome/free-brands-svg-icons";

type XShareButtonProps = {
  className?: string;
  showLabel?: boolean;
};

const byPrefixAndName = {
  fab: {
    "x-twitter": faXTwitter,
  },
} as const;

// X（旧Twitter）シェア専用のボタンです。共有時のポップアップ挙動と文面生成を一か所にまとめます。
export function XShareButton({ className, showLabel = true }: XShareButtonProps) {
  const handleShareOnX = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    const pageTitle = document.title;
    const targetUrl = window.location.href;
    const shareText = `${pageTitle} #Lafter`;
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(targetUrl)}`;
    window.open(intentUrl, "x-share-dialog", "width=600,height=400,noopener,noreferrer")?.focus();
  }, []);

  return (
    <button type="button" className={className} onClick={handleShareOnX} aria-label="X（旧Twitter）で共有">
      <FontAwesomeIcon icon={byPrefixAndName.fab["x-twitter"]} aria-hidden="true" />
      {showLabel && <span>ポスト</span>}
    </button>
  );
}
