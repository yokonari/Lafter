'use client';

import { Flag, Info, Lightbulb, PlaySquare, Search, X } from "lucide-react";
import { useEffect, useId, useMemo } from "react";
import styles from "./userTheme.module.scss";

type UsageDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function UsageDialog({ open, onClose }: UsageDialogProps) {
  const titleId = useId();

  // エスケープキーで閉じられるようにして、操作性を丁寧に高めます。
  useEffect(() => {
    if (!open) return;
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  const features = useMemo(() => [
    {
      icon: <Search size={24} className={styles.usageIcon} aria-hidden="true" />,
      title: "ネタ動画を探す",
      description:
        "キーワード検索でYouTubeのネタ動画を探せます。動画下のチャンネル名を押すと、そのチャンネルのネタだけに絞り込むこともできます。",
    },
    {
      icon: <PlaySquare size={24} className={styles.usageIcon} aria-hidden="true" />,
      title: "ネタ動画を観る",
      description:
        "気になったサムネイルを押すと、その場でプレイヤーが開きます。",
    },
    {
      icon: <Flag size={24} className={styles.usageIcon} aria-hidden="true" />,
      title: "報告する",
      description:
        "ネタ以外・非公式の動画などを見つけたら、プレイヤー内の旗アイコンから報告できます。",
    },
    {
      icon: <Lightbulb size={24} className={styles.usageIcon} aria-hidden="true" />,
      title: "新しい発見",
      description:
        "「最近」や「ランダム」で、普段見ないネタ動画にも出会えます。",
    },
    {
      icon: <Info size={24} className={styles.usageIcon} aria-hidden="true" />,
      title: "検索対象について",
      description:
        "公式お笑いチャンネル約570件・ネタ動画約1万本（2025-11-28時点）が検索対象です。すべてのネタ動画を網羅しているわけではなく、一部のチャンネル・動画は検索に出てこないことがあります。",
    },
  ], []);

  if (!open) return null;

  return (
    <div
      className={styles.contactOverlay}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.usageDialog}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.contactHeader}>
          <h2 id={titleId} className={styles.contactTitle}>
            使いかた
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={styles.contactClose}
            aria-label="ダイアログを閉じる"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.usageBody}>
          {features.map((feature) => (
            <div key={feature.title} className={styles.usageItem}>
              <div className={styles.usageIconWrap}>
                {feature.icon}
              </div>
              <div>
                <h3 className={styles.usageItemTitle}>{feature.title}</h3>
                <p className={styles.usageItemDesc}>{feature.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className={`${styles.contactActions} ${styles.usageActions}`}>
          <button
            type="button"
            onClick={onClose}
            className={styles.usageActionButton}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
