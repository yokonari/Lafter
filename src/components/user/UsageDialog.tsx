'use client';

import { Flag, Info, Lightbulb, PlaySquare, Search, X } from "lucide-react";
import { useId, useMemo } from "react";
import styles from "./userTheme.module.scss";
import { UserDialogBase } from "./UserDialogBase";

type UsageDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function UsageDialog({ open, onClose }: UsageDialogProps) {
  const titleId = useId();

  const features = useMemo(() => [
    {
      icon: <Search size={24} className={styles.usageIcon} aria-hidden="true" />,
      title: "ネタ動画を探す",
      description:
        "キーワード検索でネタ動画を探せます。チャンネル名から絞り込みもできます。",
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
        "ネタ以外・非公式の動画は旗アイコンから報告できます。",
    },
    {
      icon: <Lightbulb size={24} className={styles.usageIcon} aria-hidden="true" />,
      title: "新しい発見",
      description:
        "「最近」「ランダム」で、普段見ないネタにも出会えます。",
    },
    {
      icon: <Info size={24} className={styles.usageIcon} aria-hidden="true" />,
      title: "検索対象について",
      description:
        "約570チャンネル・約2万本をAI判定＋人力チェックで掲載しています（一部のネタ漏れや誤判定があります）。",
    },
  ], []);

  // 共通ダイアログベースへopen状態を渡し、アニメーション中のDOM保持やESC対応を丁寧に委譲します。
  return (
    <UserDialogBase
      open={open}
      onClose={onClose}
      dialogClassName={styles.usageDialog}
      overlayClassName={styles.contactOverlay}
      ariaLabelledby={titleId}
      closeOnEsc
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
    </UserDialogBase>
  );
}
