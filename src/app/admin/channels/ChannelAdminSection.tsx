"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  ChannelBulkManager,
  type ChannelRow,
} from "../components/ChannelBulkManager";
import { SearchForm } from "../components/SearchForm";
import styles from "../adminTheme.module.scss";
import { toast } from "react-toastify";
import type { Id, ToastContent, ToastOptions } from "react-toastify";

type ChannelAdminSectionProps = {
  initialChannels: ChannelRow[];
  currentPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevHref: string;
  nextHref: string;
  channelStatus: number;
  totalCount: number;
};

type PaginationState = {
  currentPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevHref: string;
  nextHref: string;
};

const ADMIN_TOAST_METHODS = ["success", "error", "info", "warn", "warning"] as const;
type AdminToastMethodName = (typeof ADMIN_TOAST_METHODS)[number];
type AdminToastInvoker = <TData = unknown>(
  content: ToastContent<TData>,
  options?: ToastOptions<TData>,
) => Id;
type AdminToastApi = typeof toast & Record<AdminToastMethodName, AdminToastInvoker>;
// Toast API の各メソッドを書き換えるにあたり readonly を除外した補助型で安全に扱います。
type MutableAdminToastApi = AdminToastApi & {
  -readonly [K in AdminToastMethodName]: AdminToastInvoker;
};
const adminToastApi = toast as MutableAdminToastApi;
// 位置指定のみを切り出した型で保持し、data などジェネリック依存の項目は触れません。
const ADMIN_BOTTOM_RIGHT_TOAST_OPTIONS: Pick<ToastOptions<unknown>, "position"> = {
  position: "bottom-right",
};

export function ChannelAdminSection({
  initialChannels,
  currentPage,
  hasPrev,
  hasNext,
  prevHref,
  nextHref,
  channelStatus,
  totalCount,
}: ChannelAdminSectionProps) {
  const router = useRouter();
  const [channels, setChannels] = useState<ChannelRow[]>(initialChannels);
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage,
    hasPrev,
    hasNext,
    prevHref,
    nextHref,
  });
  const [searchMode, setSearchMode] = useState(false);
  const [currentTotalCount, setCurrentTotalCount] = useState(totalCount);
  // 子コンポーネントが発火するトーストも含めて右下固定へ統一し、操作感を揃えます。
  useAdminBottomRightToast();

  // ページ遷移などで初期データが変わった場合に丁寧に同期します。
  useEffect(() => {
    setChannels(initialChannels);
    setPagination({
      currentPage,
      hasPrev,
      hasNext,
      prevHref,
      nextHref,
    });
    setSearchMode(false);
    setCurrentTotalCount(totalCount);
  }, [initialChannels, currentPage, hasPrev, hasNext, prevHref, nextHref, totalCount]);

  const handleSearchResults = (
    results: ChannelRow[],
    meta: { hasNext: boolean; totalCount?: number },
  ) => {
    setChannels(results);
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
    setChannels(initialChannels);
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
    searchParams.set("channel_status", String(channelStatus));

    const response = await fetch(`/api/admin/channels?${searchParams.toString()}`, {
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
      channels?: Array<{
        id: string;
        url: string;
        name: string;
        status?: number | null;
        latest_video_title?: string | null;
        latest_video_id?: string | null;
      }>;
      hasNext?: boolean;
      totalCount?: number;
    };

    const mapped: ChannelRow[] = Array.isArray(data?.channels)
      ? data.channels.map((item) => ({
        id: item.id,
        name: item.name,
        url: item.url,
        status: item.status ?? 0,
        latestVideoTitle: item.latest_video_title ?? null,
        latestVideoId: item.latest_video_id ?? null,
      }))
      : [];

    return { items: mapped, hasNext: Boolean(data?.hasNext), totalCount: data?.totalCount };
  }, [channelStatus]);

  const isPendingFilter = channelStatus === 0;
  const isRegisteredFilter = channelStatus === 1;
  const isNgFilter = channelStatus === 2;
  const isAiOkFilter = channelStatus === 3;
  const isAiNgFilter = channelStatus === 4;
  // 登録済み（OK判定）フィルターの遷移先を丁寧に整え、一覧からすぐ切り替えられるようにします。
  const buildStatusHref = (targetStatus: number) => {
    const params = new URLSearchParams();
    params.set("channel_status", String(targetStatus));
    const query = params.toString();
    return `/admin/channels${query ? `?${query}` : ""}`;
  };
  const pendingFilterHref = buildStatusHref(0);
  const handlePendingButtonClick = () => {
    router.push(pendingFilterHref);
  };
  const registeredFilterHref = buildStatusHref(1);
  const handleRegisteredButtonClick = () => {
    // 登録済みフィルターの切り替え先を丁寧に算出し、ボタン操作で遷移させます。
    router.push(registeredFilterHref);
  };
  // NG判定フィルターの遷移先も同様に用意し、status=2 の確認を素早く行えるようにします。
  const ngFilterHref = buildStatusHref(2);
  const handleNgButtonClick = () => {
    // NG判定フィルターへの切り替え操作も丁寧に router を経由させます。
    router.push(ngFilterHref);
  };
  return (
    <div className={styles.section}>
      <SearchForm<ChannelRow>
        title="チャンネル検索"
        placeholder="チャンネル名で検索"
        ariaLabel="チャンネル名で検索"
        emptyMessage="該当するチャンネルが見つかりませんでした。"
        inputId="channel-search-input"
        executeSearch={executeSearch}
        onResults={handleSearchResults}
        onReset={handleReset}
      />
      {/* 検索直下にフィルターボタンを配置し、操作の文脈をわかりやすく保ちます。 */}
      {/* チャンネルの状態ごとにフィルター操作をまとめ、ダークトーンのボタンで統一します。 */}
      <div className={styles.filterRow}>
        <div className={styles.filterButtons}>
          <button
            type="button"
            onClick={handlePendingButtonClick}
            className={`${styles.filterButton} ${isPendingFilter ? styles.buttonActiveAmber : ""}`}
          >
            未判定{isPendingFilter && `(${currentTotalCount.toLocaleString()}件)`}
          </button>
          {/* LLM による判定結果もすぐ確認できるよう AI ステータス専用ボタンを配置します。 */}
          <button
            type="button"
            onClick={() => router.push(buildStatusHref(3))}
            className={`${styles.filterButton} ${isAiOkFilter ? styles.buttonActiveGreen : ""}`}
          >
            AI-OK{isAiOkFilter && `(${currentTotalCount.toLocaleString()}件)`}
          </button>
          <button
            type="button"
            onClick={() => router.push(buildStatusHref(4))}
            className={`${styles.filterButton} ${isAiNgFilter ? styles.buttonActiveAmber : ""}`}
          >
            AI-NG{isAiNgFilter && `(${currentTotalCount.toLocaleString()}件)`}
          </button>
          <button
            type="button"
            onClick={handleRegisteredButtonClick}
            className={`${styles.filterButton} ${isRegisteredFilter ? styles.buttonActiveBlue : ""}`}
          >
            OK{isRegisteredFilter && `(${currentTotalCount.toLocaleString()}件)`}
          </button>
          <button
            type="button"
            onClick={handleNgButtonClick}
            className={`${styles.filterButton} ${isNgFilter ? styles.buttonActiveRed : ""}`}
          >
            NG{isNgFilter && `(${currentTotalCount.toLocaleString()}件)`}
          </button>
        </div>
      </div>
      <ChannelBulkManager
        channels={channels}
        currentPage={pagination.currentPage}
        hasPrev={!searchMode && pagination.hasPrev}
        hasNext={!searchMode && pagination.hasNext}
        prevHref={pagination.prevHref}
        nextHref={pagination.nextHref}
        registeredView={isRegisteredFilter}
      />
    </div>
  );
}

function useAdminBottomRightToast() {
  useEffect(() => {
    // React-Toastify の各種通知を右下へ寄せるため、メソッドを一時的にラップします。
    const patchedMethods: Array<{ name: AdminToastMethodName; original: AdminToastInvoker }> = [];
    for (const name of ADMIN_TOAST_METHODS) {
      const original = adminToastApi[name];
      const patched: AdminToastInvoker = (content, options) =>
        original(content, { ...(options ?? {}), ...ADMIN_BOTTOM_RIGHT_TOAST_OPTIONS });
      adminToastApi[name] = patched;
      patchedMethods.push({ name, original });
    }
    return () => {
      // コンポーネント破棄時には必ず元のメソッドへ戻し、他画面への副作用を防ぎます。
      for (const { name, original } of patchedMethods) {
        adminToastApi[name] = original;
      }
    };
  }, []);
}
