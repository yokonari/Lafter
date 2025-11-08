"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminTabsLayout } from "../components/AdminTabsLayout";
import { YouTubeEmbed } from "@next/third-parties/google";
import { SearchForm } from "../components/SearchForm";
import { ListFooter } from "../components/ListFooter";

export type AdminVideo = {
  id: string;
  url: string;
  title: string;
  channel_name: string;
};

type AdminVideosResponse = {
  videos: AdminVideo[];
  page: number;
  limit: number;
  hasNext: boolean;
};

type SelectionDefaults = {
  videoStatus: string;
  videoCategory: string;
};

type VideoSelection = {
  selected: boolean;
  videoStatus: string;
  videoCategory: string;
};

const VIDEO_STATUS_OPTIONS = [
  { value: "0", label: "⏳ 待ち" },
  { value: "1", label: "✅ OK" },
  { value: "2", label: "⛔ NG" },
];

const VIDEO_CATEGORY_OPTIONS = [
  { value: "0", label: "🗂️ 未分類" },
  { value: "1", label: "🎙️ 漫才" },
  { value: "2", label: "🎬 コント" },
  { value: "3", label: "🎭 ピン" },
  { value: "4", label: "🏢 その他" },
];

export default function AdminVideosPage() {
  return (
    <Suspense
      fallback={
        <AdminTabsLayout activeTab="videos">
          <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
            画面を読み込んでいます…
          </p>
        </AdminTabsLayout>
      }
    >
      <AdminVideosPageContent />
    </Suspense>
  );
}

function AdminVideosPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageParam = searchParams.get("page");
  const parsedPage = pageParam ? Number(pageParam) : 1;
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [currentPage, setCurrentPage] = useState(page);
  const [selections, setSelections] = useState<Record<string, VideoSelection>>({});
  const [submitting, setSubmitting] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [searchContext, setSearchContext] = useState<"form" | "shortcut" | null>(null);
  const [currentSearchKeyword, setCurrentSearchKeyword] = useState<string | null>(null);
  const [searchSelectionDefaults, setSearchSelectionDefaults] = useState<SelectionDefaults | null>(null);
  const searchKeywordRef = useRef<string | null>(null);

  const createInitialSelections = useCallback(
    (rows: AdminVideo[], defaults?: SelectionDefaults) => {
      const statusDefault = defaults?.videoStatus ?? "2";
      const categoryDefault = defaults?.videoCategory ?? "0";
      const next: Record<string, VideoSelection> = {};
      for (const row of rows) {
        next[row.id] = {
          selected: true,
          videoStatus: statusDefault,
          videoCategory: categoryDefault,
        };
      }
      return next;
    },
    [],
  );

  const applySearchResults = useCallback(
    (
      results: AdminVideo[],
      meta: { hasNext: boolean },
      options?: { defaults?: SelectionDefaults; mode?: "form" | "shortcut" | null },
    ) => {
      setVideos(results);
      setSelections(createInitialSelections(results, options?.defaults));
      setCurrentPage(1);
      setHasNextPage(Boolean(meta.hasNext));
      setSearchContext(options?.mode ?? null);
      if (options?.mode === "form" || options?.mode === "shortcut") {
        const keyword = searchKeywordRef.current ?? null;
        setCurrentSearchKeyword(keyword);
        setSearchSelectionDefaults(options?.defaults ?? null);
      } else {
        setCurrentSearchKeyword(null);
        setSearchSelectionDefaults(null);
        searchKeywordRef.current = null;
      }
    },
    [createInitialSelections],
  );

  const createDefaultSelections = useCallback((rows: AdminVideo[]) => {
    const next: Record<string, VideoSelection> = {};
    for (const row of rows) {
      next[row.id] = {
        selected: true,
        videoStatus: "2",
        videoCategory: "0",
      };
    }
    return next;
  }, []);

  // API から管理画面用の動画一覧を丁寧に取り出します。
  const loadVideos = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setErrorMessage(null);
      setMessage(null);
      try {
        const query = targetPage > 1 ? `?page=${targetPage}` : "";
        const response = await fetch(`/api/admin/videos${query}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        if (!response.ok) {
          const defaultMessage =
            response.status === 401
              ? "ログインの有効期限が切れています。お手数ですが再度ログインしてください。"
              : `動画一覧の取得に失敗しました。(HTTP ${response.status})`;
          const messageCandidate =
            payload && typeof payload === "object" && payload !== null && "message" in payload
              ? (payload as { message?: unknown }).message
              : undefined;
          const messageText =
            typeof messageCandidate === "string" && messageCandidate.trim() !== ""
              ? messageCandidate
              : defaultMessage;
          setErrorMessage(messageText);
          setVideos([]);
          setSelections({});
          setHasNextPage(false);
          setCurrentPage(targetPage);
          return;
        }

        if (
          !payload ||
          typeof payload !== "object" ||
          !("videos" in payload) ||
          !Array.isArray((payload as { videos: unknown }).videos) ||
          !("page" in payload)
        ) {
          throw new Error("取得した動画一覧の形式が正しくありません。");
        }

        const data = payload as AdminVideosResponse;
        setVideos(data.videos);
        setCurrentPage(data.page);
        setSelections(createDefaultSelections(data.videos));
        setHasNextPage(Boolean(data.hasNext));
        setSearchContext(null);
        setCurrentSearchKeyword(null);
        setSearchSelectionDefaults(null);
        searchKeywordRef.current = null;
      } catch (error) {
        const fallback =
          error instanceof Error ? error.message : "動画一覧の取得に失敗しました。";
        setErrorMessage(fallback);
        setVideos([]);
        setSelections({});
        setHasNextPage(false);
        setSearchContext(null);
        setCurrentSearchKeyword(null);
        setSearchSelectionDefaults(null);
        searchKeywordRef.current = null;
      } finally {
        setLoading(false);
      }
    },
    [createDefaultSelections],
  );

  useEffect(() => {
    loadVideos(page);
  }, [page, loadVideos]);

  const handleSearchResults = useCallback(
    (results: AdminVideo[], meta: { hasNext: boolean }) => {
      applySearchResults(results, meta, {
        defaults: { videoStatus: "1", videoCategory: "1" },
        mode: "form",
      });
    },
    [applySearchResults],
  );

  const handleSearchReset = useCallback(() => {
    searchKeywordRef.current = null;
    setCurrentSearchKeyword(null);
    setSearchSelectionDefaults(null);
    setSearchContext(null);
    loadVideos(page);
  }, [loadVideos, page]);

  const fetchVideosByKeyword = useCallback(async (keyword: string, pageNumber = 1) => {
    const searchParams = new URLSearchParams();
    searchParams.set("page", String(pageNumber));
    const trimmed = keyword.trim();
    if (trimmed) {
      searchParams.set("q", trimmed);
    }
    const response = await fetch(`/api/admin/videos?${searchParams.toString()}`, {
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
    if (
      !payload ||
      typeof payload !== "object" ||
      !("videos" in payload) ||
      !Array.isArray((payload as { videos: unknown }).videos)
    ) {
      throw new Error("検索結果の形式が正しくありません。");
    }
    return payload as AdminVideosResponse;
  }, []);

  const executeVideoSearch = useCallback(
    async (keyword: string) => {
      searchKeywordRef.current = keyword;
      setCurrentSearchKeyword(keyword);
      setSearchContext("form");
      setSearchSelectionDefaults({ videoStatus: "1", videoCategory: "1" });
      const data = await fetchVideosByKeyword(keyword, 1);
      return { items: data.videos, hasNext: Boolean(data.hasNext) };
    },
    [fetchVideosByKeyword],
  );

  const selectedCount = useMemo(
    () => Object.values(selections).filter((item) => item.selected).length,
    [selections],
  );

  const hasPrev = currentPage > 1;
  const effectiveHasPrev = searchContext ? currentPage > 1 : hasPrev;
  const effectiveHasNext = hasNextPage;

  const handleToggleAll = (checked: boolean) => {
    const next: Record<string, VideoSelection> = {};
    for (const [id, entry] of Object.entries(selections)) {
      next[id] = { ...entry, selected: checked };
    }
    setSelections(next);
  };

  const handleShortcutSearch = useCallback(
    async (keyword: string, defaults: SelectionDefaults) => {
      setMessage(null);
      setLoading(true);
      try {
        searchKeywordRef.current = keyword;
        setCurrentSearchKeyword(keyword);
        setSearchSelectionDefaults(defaults);
        setSearchContext("shortcut");
        const data = await fetchVideosByKeyword(keyword, 1);
        applySearchResults(
          data.videos,
          { hasNext: Boolean(data.hasNext) },
          { defaults, mode: "shortcut" },
        );
        if (data.videos.length === 0) {
          setMessage("該当する動画が見つかりませんでした。");
        }
      } catch (error) {
        const fallback =
          error instanceof Error ? error.message : "検索に失敗しました。再度お試しください。";
        setMessage(fallback);
      } finally {
        setLoading(false);
      }
    },
    [fetchVideosByKeyword, applySearchResults],
  );

  const handleManzaiShortcut = useCallback(() => {
    return handleShortcutSearch("漫才", { videoStatus: "1", videoCategory: "1" });
  }, [handleShortcutSearch]);

  const handleConteShortcut = useCallback(() => {
    return handleShortcutSearch("コント", { videoStatus: "1", videoCategory: "2" });
  }, [handleShortcutSearch]);

  const handleNetaShortcut = useCallback(() => {
    return handleShortcutSearch("ネタ", { videoStatus: "1", videoCategory: "1" });
  }, [handleShortcutSearch]);

  const loadSearchPage = useCallback(
    async (targetPage: number) => {
      if (!currentSearchKeyword || !searchContext) return;
      searchKeywordRef.current = currentSearchKeyword;
      setLoading(true);
      setMessage(null);
      try {
        const data = await fetchVideosByKeyword(currentSearchKeyword, targetPage);
        setVideos(data.videos);
        setCurrentPage(typeof data.page === "number" ? data.page : targetPage);
        setSelections(
          createInitialSelections(
            data.videos,
            searchSelectionDefaults ?? { videoStatus: "1", videoCategory: "1" },
          ),
        );
        setHasNextPage(Boolean(data.hasNext));
        if (data.videos.length === 0) {
          setMessage("該当する動画が見つかりませんでした。");
        }
      } catch (error) {
        const fallback =
          error instanceof Error ? error.message : "検索結果の取得に失敗しました。";
        setMessage(fallback);
      } finally {
        setLoading(false);
      }
    },
    [currentSearchKeyword, searchContext, fetchVideosByKeyword, createInitialSelections, searchSelectionDefaults],
  );

  const handleSubmit = async () => {
    setMessage(null);
    // 選択済みの行だけを丁寧にリクエスト形式へ整えます。
    const selectedEntries = Object.entries(selections).filter(([, entry]) => entry.selected);

    if (selectedEntries.length === 0) {
      setMessage("更新対象の行を選択してください。");
      return;
    }

    const invalid = selectedEntries.find(([, entry]) => {
      const videoStatus = Number(entry.videoStatus);
      const videoCategory = Number(entry.videoCategory);
      return videoStatus === 1 && ![1, 2].includes(videoCategory);
    });

    if (invalid) {
      setMessage("動画ステータスを ✅ OK にする場合は、カテゴリを漫才またはコントに指定してください。");
      return;
    }

    const items = selectedEntries.map(([id, entry]) => ({
        id,
        video_status: Number(entry.videoStatus),
        video_category: Number(entry.videoCategory),
      }));

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/video/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items }),
      });
      const data = (await response.json()) as { message?: string; processed?: number };
      if (!response.ok) {
        const errorMessage =
          typeof data?.message === "string" && data.message.trim() !== ""
            ? data.message
            : "動画の更新に失敗しました。";
        setMessage(errorMessage);
        return;
      }
      const successMessage =
        typeof data?.message === "string" && data.message.trim() !== ""
          ? data.message
          : `動画の更新が完了しました。（${data?.processed ?? items.length}件）`;
      setMessage(successMessage);
      setSelections((prev) => {
        const next: Record<string, VideoSelection> = {};
        for (const video of videos) {
          next[video.id] = {
            ...(prev[video.id] ?? {
              videoStatus: "2",
              videoCategory: "0",
            }),
            selected: true,
          };
        }
        return next;
      });
      await loadVideos(currentPage);
    } catch (error) {
      const fallback =
        error instanceof Error ? error.message : "動画更新中に予期せぬエラーが発生しました。";
      setMessage(fallback);
    } finally {
      setSubmitting(false);
    }
  };

  const goToPage = (targetPage: number) => {
    if (searchContext) {
      void loadSearchPage(targetPage);
      return;
    }
    if (targetPage === currentPage) return;
    const query = targetPage > 1 ? `?page=${targetPage}` : "";
    router.push(`/admin/videos${query}`);
  };

  return (
    <AdminTabsLayout activeTab="videos">
      {errorMessage ? (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <SearchForm<AdminVideo>
            title="動画検索"
            placeholder="動画タイトルで検索"
            ariaLabel="動画タイトルで検索"
            emptyMessage="該当する動画が見つかりませんでした。"
            inputId="video-search-input"
            executeSearch={executeVideoSearch}
            onResults={handleSearchResults}
            onReset={handleSearchReset}
          />
          {/* よく使う漫才・コント・ネタ検索をワンタップで呼び出せる補助ボタンをテーブル直前に配置します。 */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleManzaiShortcut}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
              disabled={loading}
            >
              漫才
            </button>
            <button
              type="button"
              onClick={handleConteShortcut}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
              disabled={loading}
            >
              コント
            </button>
            <button
              type="button"
              onClick={handleNetaShortcut}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
              disabled={loading}
            >
              ネタ
            </button>
          </div>
          {message ? (
            <p className="rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {message}
            </p>
          ) : null}

          {loading ? (
            <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
              読み込み中です…
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:hidden">
                {videos.length === 0 ? (
                  <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                    表示できる動画がありません。
                  </p>
                ) : (
                  videos.map((video) => {
                    const entry = selections[video.id] ?? {
                      selected: true,
                      videoStatus: "2",
                      videoCategory: "0",
                    };
                    return (
                      <article
                        key={video.id}
                        className="rounded border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                            checked={entry.selected}
                            onChange={(event) =>
                              setSelections((prev) => ({
                                ...prev,
                                [video.id]: {
                                  ...entry,
                                  selected: event.target.checked,
                                },
                              }))
                            }
                          />
                          {video.title}
                        </label>
                        <div className="mt-3 space-y-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor={`video-status-${video.id}`} className="text-slate-600">
                              動画ステータス
                            </label>
                            <select
                              id={`video-status-${video.id}`}
                              className="w-2/3 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                              value={entry.videoStatus}
                              onChange={(event) =>
                                setSelections((prev) => ({
                                  ...prev,
                                  [video.id]: {
                                    ...entry,
                                    videoStatus: event.target.value,
                                  },
                                }))
                              }
                            >
                              {VIDEO_STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          {entry.videoStatus === "2" ? null : (
                            <div className="flex items-center justify-between gap-2">
                              <label
                                htmlFor={`video-category-${video.id}`}
                                className="text-slate-600"
                              >
                                動画カテゴリ
                              </label>
                              <select
                                id={`video-category-${video.id}`}
                                className="w-2/3 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                                value={entry.videoCategory}
                                onChange={(event) =>
                                  setSelections((prev) => ({
                                    ...prev,
                                    [video.id]: {
                                      ...entry,
                                      videoCategory: event.target.value,
                                    },
                                  }))
                                }
                              >
                                {VIDEO_CATEGORY_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          <div
                            className="w-full overflow-hidden rounded border border-slate-200 shadow-sm"
                           style={{ aspectRatio: "16 / 9" }}
                         >
                            {renderEmbeddedVideo(video)}
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>

              <div className="hidden overflow-x-auto sm:block">
                <table className="min-w-full table-fixed divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="w-8 px-4 py-3">
                        <span className="sr-only">選択</span>
                      </th>
                      <th scope="col" className="w-1/5 px-4 py-3 font-medium text-slate-700">
                        動画タイトル
                      </th>
                      <th scope="col" className="w-1/5 px-4 py-3 font-medium text-slate-700">
                        チャンネル
                      </th>
                      <th scope="col" className="w-1/5 px-4 py-3 font-medium text-slate-700">
                        動画ステータス
                      </th>
                      <th scope="col" className="w-1/5 px-4 py-3 font-medium text-slate-700">
                        動画カテゴリ
                      </th>
                      <th scope="col" className="w-1/5 px-4 py-3 font-medium text-slate-700">
                        YouTube
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {videos.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                          表示できる動画がありません。
                        </td>
                      </tr>
                    ) : (
                      videos.map((video) => {
                        const entry = selections[video.id] ?? {
                          selected: true,
                          videoStatus: "2",
                          videoCategory: "0",
                        };
                        return (
                          <tr key={video.id} className="hover:bg-slate-50">
                            <td className="w-8 px-4 py-3">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                                checked={entry.selected}
                                onChange={(event) =>
                                  setSelections((prev) => ({
                                    ...prev,
                                    [video.id]: {
                                      ...entry,
                                      selected: event.target.checked,
                                    },
                                  }))
                                }
                                aria-label={`${video.title} を選択`}
                              />
                            </td>
                            <td className="w-1/5 px-4 py-3 font-medium text-slate-900">{video.title}</td>
                            <td className="w-1/5 px-4 py-3 text-slate-600">
                              {video.channel_name || "チャンネル未登録"}
                            </td>
                            <td className="w-1/5 px-4 py-3">
                              <label className="sr-only" htmlFor={`video-status-${video.id}`}>
                                動画ステータス
                              </label>
                              <select
                                id={`video-status-${video.id}`}
                                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                                value={entry.videoStatus}
                                onChange={(event) =>
                                  setSelections((prev) => ({
                                    ...prev,
                                    [video.id]: {
                                      ...entry,
                                      videoStatus: event.target.value,
                                    },
                                  }))
                                }
                              >
                                {VIDEO_STATUS_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="w-1/5 px-4 py-3">
                              {entry.videoStatus === "2" ? (
                                <span className="text-sm text-slate-500">NG のため設定不要</span>
                              ) : (
                                <>
                                  <label className="sr-only" htmlFor={`video-category-${video.id}`}>
                                    動画カテゴリ
                                  </label>
                                  <select
                                    id={`video-category-${video.id}`}
                                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                                    value={entry.videoCategory}
                                    onChange={(event) =>
                                      setSelections((prev) => ({
                                        ...prev,
                                        [video.id]: {
                                          ...entry,
                                          videoCategory: event.target.value,
                                        },
                                      }))
                                    }
                                  >
                                    {VIDEO_CATEGORY_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </>
                              )}
                            </td>
                            <td className="w-1/5 px-4 py-3 text-slate-600">
                              <div
                                className="w-64 overflow-hidden rounded border border-slate-200 shadow-sm"
                                style={{ aspectRatio: "16 / 9" }}
                              >
                                {renderEmbeddedVideo(video)}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <ListFooter
            paging={{
              currentPage,
              hasPrev: effectiveHasPrev,
              hasNext: effectiveHasNext,
              onPrev: effectiveHasPrev ? () => goToPage(currentPage - 1) : undefined,
              onNext: effectiveHasNext ? () => goToPage(currentPage + 1) : undefined,
            }}
            headerContent={
              <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                      checked={selectedCount > 0 && selectedCount === Object.keys(selections).length}
                      onChange={(event) => handleToggleAll(event.target.checked)}
                      aria-label="全て選択"
                      disabled={loading || videos.length === 0}
                    />
                    全て選択
                  </label>
                  <span className="text-sm text-slate-500">
                    選択中: {selectedCount} / {videos.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || submitting || videos.length === 0}
                  className="rounded-full bg-[#f2a51e] px-6 py-2 text-sm font-medium text-white transition-colors hover:brightness-110 disabled:opacity-60"
                >
                  {submitting ? "送信中…" : "更新"}
                </button>
              </div>
            }
          />
        </div>
      )}
    </AdminTabsLayout>
  );
}

// YouTube の視聴URLを埋め込み用URLへ丁寧に変換します。
function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    if (hostname === "youtu.be") {
      const videoId = parsed.pathname.slice(1);
      return videoId || null;
    }
    if (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "youtube-nocookie.com"
    ) {
      if (parsed.pathname === "/watch") {
        const videoId = parsed.searchParams.get("v");
        return videoId || null;
      }
      if (parsed.pathname.startsWith("/embed/")) {
        const videoId = parsed.pathname.split("/")[2];
        return videoId || null;
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        const videoId = parsed.pathname.split("/")[2];
        return videoId || null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function renderEmbeddedVideo(video: AdminVideo) {
  const videoId = extractYouTubeVideoId(video.url);
  if (!videoId) {
    return (
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-full items-center justify-center text-slate-900 underline underline-offset-4 hover:text-slate-700"
      >
        開く
      </a>
    );
  }
  return (
    <YouTubeEmbed
      videoid={videoId}
    />
  );
}
