"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import styles from "../adminTheme.module.scss";

type BulkControl = {
  selectedCount: number;
  totalCount: number;
  onToggleAll: (checked: boolean) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel?: string;
  disabled?: boolean;
};

type ListFooterProps = {
  headerContent?: ReactNode;
  selectionContent?: ReactNode;
  actionContent?: ReactNode;
  bulkControl?: BulkControl;
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

export function ListFooter({ headerContent, selectionContent, actionContent, bulkControl, paging }: ListFooterProps) {
  const renderControl = (
    enabled: boolean,
    href: string | undefined,
    onClick: (() => void) | undefined,
    label: string,
    icon: ReactNode,
    className: string,
  ) => {
    if (!enabled) {
      return (
        <span className={`${className} opacity-50 cursor-not-allowed`}>
          {icon}
          <span className="sr-only">{label}</span>
        </span>
      );
    }
    if (href) {
      return (
        <Link href={href} prefetch={false} className={className} aria-label={label}>
          {icon}
        </Link>
      );
    }
    if (onClick) {
      return (
        <button type="button" onClick={onClick} className={className} aria-label={label}>
          {icon}
        </button>
      );
    }
    return null;
  };

  const resolvedSelectionContent = selectionContent ?? (bulkControl ? (
    <>
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={bulkControl.totalCount > 0 && bulkControl.selectedCount === bulkControl.totalCount}
          onChange={(event) => bulkControl.onToggleAll(event.target.checked)}
          disabled={bulkControl.disabled || bulkControl.submitting}
          aria-label="全て選択"
        />
        全て選択
      </label>
      <span className={styles.metaText}>
        選択中: {bulkControl.selectedCount} / {bulkControl.totalCount}
      </span>
    </>
  ) : null);

  const resolvedActionContent = actionContent ?? (bulkControl ? (
    <button
      type="button"
      onClick={bulkControl.onSubmit}
      disabled={bulkControl.submitting || bulkControl.disabled}
      className={styles.primaryButton}
    >
      {bulkControl.submitting ? "送信中…" : (bulkControl.submitLabel ?? "更新")}
    </button>
  ) : null);

  return (
    <>
      <div className="lg:hidden">
        <div className={styles.footer}>
          {headerContent ? (
            <div className={styles.header}>
              {headerContent}
            </div>
          ) : resolvedSelectionContent || resolvedActionContent ? (
            <div className={styles.header}>
              <div className={`flex flex-1 flex-wrap items-center justify-between gap-3 ${styles.headerText}`}>
                {resolvedSelectionContent && <div className="flex flex-wrap items-center gap-3 text-sm">{resolvedSelectionContent}</div>}
                {resolvedActionContent}
              </div>
            </div>
          ) : null}
          <div className={styles.pageInfoBlock}>
            <span className={styles.pageInfo}>ページ {paging.currentPage}</span>
            <div className={styles.controls}>
              {renderControl(
                paging.hasPrev,
                paging.prevHref,
                paging.onPrev,
                "前のページ",
                <ArrowLeft aria-hidden="true" size={20} />,
                styles.control
              )}
              {renderControl(
                paging.hasNext,
                paging.nextHref,
                paging.onNext,
                "次のページ",
                <ArrowRight aria-hidden="true" size={20} />,
                styles.control
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="hidden lg:block">
        <div className={styles.desktopFooterCard}>
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className={`flex flex-wrap items-center gap-3 text-sm ${styles.headerText}`}>
              {resolvedSelectionContent}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-4">
              <div className={styles.pagerSection}>
                <span>ページ {paging.currentPage}</span>
                <div className={styles.pagerControls}>
                  {renderControl(
                    paging.hasPrev,
                    paging.prevHref,
                    paging.onPrev,
                    "前のページ",
                    <ArrowLeft aria-hidden="true" size={22} />,
                    styles.pagerControl
                  )}
                  {renderControl(
                    paging.hasNext,
                    paging.nextHref,
                    paging.onNext,
                    "次のページ",
                    <ArrowRight aria-hidden="true" size={22} />,
                    styles.pagerControl
                  )}
                </div>
              </div>
              {resolvedActionContent}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
