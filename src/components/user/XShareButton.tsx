'use client';

import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { containsNgWord } from "@/lib/ng-words";

type XShareButtonProps = {
  className?: string;
  showLabel?: boolean;
  /** trueの場合、現在のページではなくサイトトップを常にシェアします */
  useStaticTopShare?: boolean;
};

const byPrefixAndName = {
  fab: {
    "x-twitter": faXTwitter,
  },
} as const;

// サイトトップの固定情報
const SITE_TOP_URL = "https://lafter.day";
const SITE_TOP_TITLE = "Lafter | お笑いネタ動画検索サイト";

// X（旧Twitter）シェア専用のボタンです。共有時のポップアップ挙動と文面生成を一か所にまとめます。
// タイトルにNGワードが含まれている場合はボタンを非表示にします（useStaticTopShare時は常に表示）。
export function XShareButton({ className, showLabel = true, useStaticTopShare = false }: XShareButtonProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // サイトトップ固定シェアの場合はNGワードチェックをスキップ
    if (useStaticTopShare) {
      setIsVisible(true);
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const pageTitle = document.title.replace(/\s*\|\s*Lafter/gi, '').trim();
    // タイトルにNGワードが含まれていたら非表示
    if (containsNgWord(pageTitle)) {
      setIsVisible(false);
    } else {
      setIsVisible(true);
    }
  }, [useStaticTopShare]);

  const handleShareOnX = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    let shareText: string;
    let targetUrl: string;

    if (useStaticTopShare) {
      // サイトトップを固定でシェア
      shareText = `${SITE_TOP_TITLE} #Lafter`;
      targetUrl = SITE_TOP_URL;
    } else {
      // 現在のページをシェア
      const pageTitle = document.title.replace(/\s*\|\s*Lafter/gi, '').trim();
      shareText = `${pageTitle} #Lafter`;
      targetUrl = window.location.href;
    }

    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(targetUrl)}`;
    window.open(intentUrl, "x-share-dialog", "width=600,height=400,noopener,noreferrer")?.focus();
  }, [useStaticTopShare]);

  // NGワードが含まれている場合はボタンを表示しない（useStaticTopShare時は常に表示）
  if (!isVisible) {
    return null;
  }

  return (
    <button type="button" className={className} onClick={handleShareOnX} aria-label="X（旧Twitter）で共有">
      <FontAwesomeIcon icon={byPrefixAndName.fab["x-twitter"]} aria-hidden="true" />
      {showLabel && <span>ポスト</span>}
    </button>
  );
}

