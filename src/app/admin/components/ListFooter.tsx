"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import styles from "../adminTheme.module.scss";

type ListFooterProps = {
  headerContent?: ReactNode;
  paging: {
    currentPage: number;
    hasPrev: boolean;
    hasNext: boolean;
    prevHref?: string;
    nextHref?: string;
    onPrev?: () => void;
    onNext?: () => void;
  };
};

export function ListFooter({ headerContent, paging }: ListFooterProps) {
  const renderControl = (
    enabled: boolean,
    href: string | undefined,
    onClick: (() => void) | undefined,
    label: string,
    icon: string,
  ) => {
    if (!enabled) {
      return (
        <span className={styles.controlDisabled}>
          <span className="material-symbols-rounded" aria-hidden="true">
            {icon}
          </span>
          <span className="sr-only">{label}</span>
        </span>
      );
    }
    if (href) {
      return (
        <Link href={href} prefetch={false} className={styles.control} aria-label={label}>
          <span className="material-symbols-rounded">{icon}</span>
        </Link>
      );
    }
    if (onClick) {
      return (
        <button type="button" onClick={onClick} className={styles.control} aria-label={label}>
          <span className="material-symbols-rounded">{icon}</span>
        </button>
      );
    }
    return null;
  };

  // フッター全体も落ち着いたダークトーンで統一し、操作性を高めています。
  return (
    <div className={styles.footer}>
      {headerContent ? (
        <div className={styles.header}>
          {headerContent}
        </div>
      ) : null}
      <div className={styles.pageInfoBlock}>
        <span className={styles.pageInfo}>ページ {paging.currentPage}</span>
        <div className={styles.controls}>
          {renderControl(paging.hasPrev, paging.prevHref, paging.onPrev, "前のページ", "arrow_back")}
          {renderControl(paging.hasNext, paging.nextHref, paging.onNext, "次のページ", "arrow_forward")}
        </div>
      </div>
    </div>
  );
}
