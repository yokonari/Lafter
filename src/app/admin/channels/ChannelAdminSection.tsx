"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
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
        category?: number | null;
        artist_name?: string | null;
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
          category: item.category ?? null,
          artistName: item.artist_name ?? null,
          keyword: item.keyword ?? null,
          latestVideoTitle: item.latest_video_title ?? null,
          latestVideoId: item.latest_video_id ?? null,
        }))
      : [];

    return { items: mapped, hasNext: Boolean(data?.hasNext) };
  }, [channelStatus]);

  const isRegisteredFilter = channelStatus === 1;
  // 登録済みフィルターの遷移先を丁寧に整え、一覧からすぐ切り替えられるようにします。
  const registeredFilterHref = (() => {
    const params = new URLSearchParams();
    if (!isRegisteredFilter) {
      params.set("channel_status", "1");
    }
    const query = params.toString();
    return `/admin/channels${query ? `?${query}` : ""}`;
  })();
  const handleRegisteredButtonClick = () => {
    // 登録済みフィルターの切り替え先を丁寧に算出し、ボタン操作で遷移させます。
    router.push(registeredFilterHref);
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
          onClick={handleRegisteredButtonClick}
          className={`rounded-full border px-4 py-2 text-sm transition-colors ${
            isRegisteredFilter
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          登録済み
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
