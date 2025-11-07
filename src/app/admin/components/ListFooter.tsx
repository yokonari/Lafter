"use client";

import type { ReactNode } from "react";
import Link from "next/link";

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
        <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-300">
          <span className="material-symbols-rounded" aria-hidden="true">
            {icon}
          </span>
          <span className="sr-only">{label}</span>
        </span>
      );
    }
    if (href) {
      return (
        <Link
          href={href}
          prefetch={false}
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 text-slate-700 transition-colors hover:bg-slate-100"
          aria-label={label}
        >
          <span className="material-symbols-rounded">{icon}</span>
        </Link>
      );
    }
    if (onClick) {
      return (
        <button
          type="button"
          onClick={onClick}
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 text-slate-700 transition-colors hover:bg-slate-100"
          aria-label={label}
        >
          <span className="material-symbols-rounded">{icon}</span>
        </button>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-3">
      {headerContent ? (
        <div className="flex flex-wrap items-center justify-between gap-4">{headerContent}</div>
      ) : null}
      <div className="flex flex-col items-center gap-3 pt-4">
        <span className="text-sm text-slate-600">ページ {paging.currentPage}</span>
        <div className="flex gap-3">
          {renderControl(paging.hasPrev, paging.prevHref, paging.onPrev, "前のページ", "arrow_back")}
          {renderControl(paging.hasNext, paging.nextHref, paging.onNext, "次のページ", "arrow_forward")}
        </div>
      </div>
    </div>
  );
}
