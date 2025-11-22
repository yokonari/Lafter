'use client';

import { Flag, Lightbulb, PlaySquare, Search, X } from "lucide-react";
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
      description: "画面上部の検索バーにキーワードを入力し、Enterキーで検索できます。YouTube上のネタ動画やプレイリストを横断的に探せます。",
    },
    {
      icon: <PlaySquare size={24} className={styles.usageIcon} aria-hidden="true" />,
      title: "ネタ動画を観る",
      description: "気になったサムネイルをクリックすると、画面遷移せずにその場でプレイヤーが立ち上がります。",
    },
    {
      icon: <Flag size={24} className={styles.usageIcon} aria-hidden="true" />,
      title: "報告する",
      description: "ネタ以外の動画・非公式の動画など、不適切なコンテンツを見つけた場合は、プレイヤー内の旗アイコンから報告できます。",
    },
    {
      icon: <Lightbulb size={24} className={styles.usageIcon} aria-hidden="true" />,
      title: "新しい発見",
      description: "「最近」や「ランダム」セクションで、普段見ない新しいネタ動画との出会いを楽しめます。",
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
            Lafterの使いかた
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
