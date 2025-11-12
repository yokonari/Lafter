"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ChannelBulkManager,
  type ChannelRow,
} from "../components/ChannelBulkManager";
import { SearchForm } from "../components/SearchForm";

type ChannelAdminSectionProps = {
  initialChannels: ChannelRow[];
  currentPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevHref: string;
  nextHref: string;
  channelStatus: number;
};

type PaginationState = {
  currentPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevHref: string;
  nextHref: string;
};

export function ChannelAdminSection({
  initialChannels,
  currentPage,
  hasPrev,
  hasNext,
  prevHref,
  nextHref,
  channelStatus,
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
  }, [initialChannels, currentPage, hasPrev, hasNext, prevHref, nextHref]);

  const handleSearchResults = (
    results: ChannelRow[],
    meta: { hasNext: boolean },
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
        keyword?: string | null;
        latest_video_title?: string | null;
        latest_video_id?: string | null;
      }>;
      hasNext?: boolean;
    };

    const mapped: ChannelRow[] = Array.isArray(data?.channels)
      ? data.channels.map((item) => ({
          id: item.id,
          name: item.name,
          url: item.url,
          status: item.status ?? 0,
          keyword: item.keyword ?? null,
          latestVideoTitle: item.latest_video_title ?? null,
          latestVideoId: item.latest_video_id ?? null,
        }))
      : [];

    return { items: mapped, hasNext: Boolean(data?.hasNext) };
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
    <div className="flex flex-col gap-4">
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
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handlePendingButtonClick}
          className={`rounded-full border px-4 py-2 text-sm transition-colors ${
            isPendingFilter
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          未判定
        </button>
        {/* LLM による判定結果もすぐ確認できるよう AI ステータス専用ボタンを配置します。 */}
        <button
          type="button"
          onClick={() => router.push(buildStatusHref(3))}
          className={`rounded-full border px-4 py-2 text-sm transition-colors ${
            isAiOkFilter
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          AI-OK
        </button>
        <button
          type="button"
          onClick={() => router.push(buildStatusHref(4))}
          className={`rounded-full border px-4 py-2 text-sm transition-colors ${
            isAiNgFilter
              ? "border-amber-600 bg-amber-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          AI-NG
        </button>
        <button
          type="button"
          onClick={handleRegisteredButtonClick}
          className={`rounded-full border px-4 py-2 text-sm transition-colors ${
            isRegisteredFilter
              ? "border-blue-700 bg-blue-700 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          OK
        </button>
        <button
          type="button"
          onClick={handleNgButtonClick}
          className={`rounded-full border px-4 py-2 text-sm transition-colors ${
            isNgFilter
              ? "border-red-600 bg-red-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          NG
        </button>
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
