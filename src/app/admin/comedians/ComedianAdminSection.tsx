"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ComedianList } from "./_components/ComedianList";
import { ComedianDeleteDialog } from "./_components/ComedianDeleteDialog";
import { AgencyChannelDialog } from "./_components/AgencyChannelDialog";
import { MediaChannelDialog } from "./_components/MediaChannelDialog";
import { StyleDialog } from "./_components/StyleDialog";
import { SearchForm } from "../components/SearchForm";
import styles from "../adminTheme.module.scss";
import { useAdminToast } from "../hooks/useAdminToast";

export type ComedianRow = {
  id: number;
  slug: string;
  name: string;
  kana: string | null;
  startedOn: string | null;
  agencyId: string;
  agencyName: string;
  styles: string[];
  channelCount: number;
  createdAt: string;
  updatedAt: string;
};

type ComedianAdminSectionProps = {
  initialComedians: ComedianRow[];
  currentPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevHref: string;
  nextHref: string;
  totalCount: number;
};

type PaginationState = {
  currentPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevHref: string;
  nextHref: string;
};

export function ComedianAdminSection({
  initialComedians,
  currentPage,
  hasPrev,
  hasNext,
  prevHref,
  nextHref,
  totalCount,
}: ComedianAdminSectionProps) {
  const router = useRouter();
  const [comedians, setComedians] = useState<ComedianRow[]>(initialComedians);
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage,
    hasPrev,
    hasNext,
    prevHref,
    nextHref,
  });
  const [searchMode, setSearchMode] = useState(false);
  const [currentTotalCount, setCurrentTotalCount] = useState(totalCount);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingComedian, setDeletingComedian] = useState<ComedianRow | null>(null);
  // 事務所チャンネル管理ダイアログの表示状態を保持します。
  const [isAgencyChannelDialogOpen, setIsAgencyChannelDialogOpen] = useState(false);
  // メディアチャンネル管理ダイアログの表示状態を保持します。
  const [isMediaChannelDialogOpen, setIsMediaChannelDialogOpen] = useState(false);
  // 芸風管理ダイアログの表示状態を保持します。
  const [isStyleDialogOpen, setIsStyleDialogOpen] = useState(false);

  useAdminToast();

  // ページ遷移などで初期データが変わった場合に同期します。
  useEffect(() => {
    setComedians(initialComedians);
    setPagination({
      currentPage,
      hasPrev,
      hasNext,
      prevHref,
      nextHref,
    });
    setSearchMode(false);
    setCurrentTotalCount(totalCount);
  }, [initialComedians, currentPage, hasPrev, hasNext, prevHref, nextHref, totalCount]);

  const handleDeleteClick = (comedian: ComedianRow) => {
    setDeletingComedian(comedian);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteSuccess = () => {
    setIsDeleteDialogOpen(false);
    setDeletingComedian(null);
    router.refresh();
  };

  const handleSearchResults = (
    results: ComedianRow[],
    meta: { hasNext: boolean; totalCount?: number },
  ) => {
    // 検索結果を一覧に反映します。
    setComedians(results);
    setPagination({
      currentPage: 1,
      hasPrev: false,
      hasNext: meta.hasNext,
      prevHref: "#",
      nextHref: "#",
    });
    setSearchMode(true);
    if (typeof meta.totalCount === "number") {
      setCurrentTotalCount(meta.totalCount);
    }
  };

  const handleReset = () => {
    // 検索解除時は初期データへ戻します。
    setComedians(initialComedians);
    setPagination({
      currentPage,
      hasPrev,
      hasNext,
      prevHref,
      nextHref,
    });
    setSearchMode(false);
    setCurrentTotalCount(totalCount);
  };

  const executeSearch = useCallback(async (keyword: string) => {
    const searchParams = new URLSearchParams();
    searchParams.set("q", keyword);
    searchParams.set("page", "1");

    const response = await fetch(`/api/admin/comedians?${searchParams.toString()}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && typeof payload.message === "string"
          ? payload.message
          : "検索に失敗しました。再度お試しください。";
      throw new Error(message);
    }

    const data = payload as {
      comedians?: ComedianRow[];
      hasNext?: boolean;
      totalCount?: number;
    };

    return {
      items: Array.isArray(data?.comedians) ? data.comedians : [],
      hasNext: Boolean(data?.hasNext),
      totalCount: data?.totalCount,
    };
  }, []);

  return (
    <div className={styles.section}>
      <SearchForm<ComedianRow>
        title="芸人検索"
        placeholder="芸人名で検索"
        ariaLabel="芸人名で検索"
        emptyMessage="該当する芸人が見つかりませんでした。"
        inputId="comedian-search-input"
        executeSearch={executeSearch}
        onResults={handleSearchResults}
        onReset={handleReset}
      />
      <div className={styles.sectionHeader}>
        <h1 className={styles.sectionTitle}>芸人管理</h1>
        <div className={styles.sectionHeaderActions}>
          {/* 操作ボタンを右側でまとめて表示します。 */}
          <Link
            href="/admin/comedians/new"
            className={styles.primaryButton}
            style={{ textDecoration: "none" }}
          >
            芸人追加
          </Link>
          <button
            type="button"
            onClick={() => setIsAgencyChannelDialogOpen(true)}
            className={styles.secondaryButton}
          >
            事務所チャンネル追加
          </button>
          <button
            type="button"
            onClick={() => setIsMediaChannelDialogOpen(true)}
            className={styles.secondaryButton}
          >
            メディアチャンネル追加
          </button>
          <button
            type="button"
            onClick={() => setIsStyleDialogOpen(true)}
            className={styles.secondaryButton}
          >
            芸風管理
          </button>
        </div>
      </div>

      <p className={styles.statusText}>全{currentTotalCount.toLocaleString()}件</p>

      <ComedianList
        comedians={comedians}
        onEdit={(comedian) => router.push(`/admin/comedians/${comedian.id}/edit?page=${pagination.currentPage}`)}
        onDelete={handleDeleteClick}
        currentPage={pagination.currentPage}
        hasPrev={!searchMode && pagination.hasPrev}
        hasNext={!searchMode && pagination.hasNext}
        prevHref={pagination.prevHref}
        nextHref={pagination.nextHref}
      />

      {isDeleteDialogOpen && deletingComedian && (
        <ComedianDeleteDialog
          comedian={deletingComedian}
          onSuccess={handleDeleteSuccess}
          onClose={() => {
            setIsDeleteDialogOpen(false);
            setDeletingComedian(null);
          }}
        />
      )}
      {isAgencyChannelDialogOpen && (
        // 事務所チャンネルの確認・編集ダイアログを表示します。
        <AgencyChannelDialog
          onClose={() => setIsAgencyChannelDialogOpen(false)}
        />
      )}
      {isMediaChannelDialogOpen && (
        // メディアチャンネルの確認・編集ダイアログを表示します。
        <MediaChannelDialog
          onClose={() => setIsMediaChannelDialogOpen(false)}
        />
      )}
      {isStyleDialogOpen && (
        // 芸風の確認・編集ダイアログを表示します。
        <StyleDialog
          onClose={() => setIsStyleDialogOpen(false)}
        />
      )}
    </div>
  );
}
