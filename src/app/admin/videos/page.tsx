"use client";

import Image from "next/image";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VideoDialog } from "@/components/user/VideoDialog";
import type { VideoItem } from "@/lib/videoService";
import { AdminTabsLayout } from "../components/AdminTabsLayout";
import { SearchForm } from "../components/SearchForm";
import { ListFooter } from "../components/ListFooter";
import { toast } from "react-toastify";
import styles from "../adminTheme.module.scss";

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
  selected?: boolean;
};

type VideoSelection = {
  selected: boolean;
  videoStatus: string;
};

const VIDEO_STATUS_OPTIONS = [
  { value: "1", label: "✅ OK" },
  { value: "2", label: "⛔ NG" },
];

type ShortcutConfig = {
  label: string;
  keywords?: string[];
  filterTitles?: RegExp;
};

const SHORTCUT_CONFIG: Record<string, ShortcutConfig> = {
  manzai: { label: "漫才", keywords: ["漫才"] },
  conte: { label: "コント", keywords: ["コント"] },
  neta: { label: "ネタ", keywords: ["ネタ"] },
  variety: {
    label: "ものまね / モノマネ / 歌 / あるある",
    keywords: ["ものまね", "モノマネ", "歌", "あるある"],
  },
  titled: {
    label: "タイトルあり",
    filterTitles: /[「」『』【】]/,
  },
};

type ShortcutKey = keyof typeof SHORTCUT_CONFIG;

const defaultVideoStatus = 3; // 初期表示では AI OK 判定済みの動画を優先して確認できるようにします。

export default function AdminVideosPage() {
  return (
    <Suspense
      fallback={
        <AdminTabsLayout activeTab="videos">
          <p className={styles.feedbackCard}>
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
  const videoStatusParam = searchParams.get("video_status");
  const parsedStatusFilter = videoStatusParam ? Number(videoStatusParam) : defaultVideoStatus;
  const videoStatusFilter =
    Number.isFinite(parsedStatusFilter) && parsedStatusFilter >= 0 && parsedStatusFilter <= 4
      ? Math.floor(parsedStatusFilter)
      : defaultVideoStatus;

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [currentPage, setCurrentPage] = useState(page);
  const [selections, setSelections] = useState<Record<string, VideoSelection>>({});
  const [submitting, setSubmitting] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [searchContext, setSearchContext] = useState<"form" | "shortcut" | null>(null);
  const [currentSearchKeyword, setCurrentSearchKeyword] = useState<string | null>(null);
  const [searchSelectionDefaults, setSearchSelectionDefaults] = useState<SelectionDefaults | null>(null);
  const searchKeywordRef = useRef<string | null>(null);
  const [activeShortcut, setActiveShortcut] = useState<ShortcutKey | null>(null);
  const [autoCategorizing, setAutoCategorizing] = useState(false);
  const [autoCategorizeLimit, setAutoCategorizeLimit] = useState(500);
  const [dialogVideo, setDialogVideo] = useState<VideoItem | null>(null);
  const resolveStatusValue = (value?: number | string | null) => {
    const numeric =
      typeof value === "string"
        ? Number(value)
        : typeof value === "number"
          ? value
          : undefined;
    if (numeric === 4) {
      return "2";
    }
    if (numeric === 1 || numeric === 2) {
      return String(numeric);
    }
    return "1";
  };
  // サムネイル押下時にモーダル動画を表示させる制御を丁寧に用意します。
  const handleThumbnailDialogOpen = useCallback((video: AdminVideo, videoId: string) => {
    const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    setDialogVideo({
      id: videoId,
      videoId,
      title: video.title,
      thumbnail: thumbnailUrl,
    });
  }, []);
  const handleDialogClose = useCallback(() => {
    setDialogVideo(null);
  }, []);

  const createInitialSelections = useCallback(
    (rows: AdminVideo[], defaults?: SelectionDefaults) => {
      const statusDefault = resolveStatusValue(defaults?.videoStatus ?? videoStatusFilter);
      const selectedDefault = defaults?.selected ?? true;
      const next: Record<string, VideoSelection> = {};
      for (const row of rows) {
        next[row.id] = {
          selected: selectedDefault,
          videoStatus: statusDefault,
        };
      }
      return next;
    },
    [videoStatusFilter],
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

  // API から管理画面用の動画一覧を丁寧に取り出します。
  const loadVideos = useCallback(
    async (targetPage: number, statusFilter: number) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const search = new URLSearchParams();
        if (targetPage > 1) {
          search.set("page", String(targetPage));
        }
        search.set("video_status", String(statusFilter));
        const query = search.toString();
        const response = await fetch(`/api/admin/videos${query ? `?${query}` : ""}`, {
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
          toast.error(messageText);
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
        const defaultStatusForSelection = resolveStatusValue(statusFilter);
        setSelections(
          createInitialSelections(data.videos, {
            videoStatus: defaultStatusForSelection,
            selected: true,
          }),
        );
        setHasNextPage(Boolean(data.hasNext));
        setSearchContext(null);
        setCurrentSearchKeyword(null);
        setSearchSelectionDefaults(null);
        searchKeywordRef.current = null;
        setActiveShortcut(null);
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
        setActiveShortcut(null);
        toast.error(fallback);
      } finally {
        setLoading(false);
      }
    },
    [createInitialSelections],
  );

  useEffect(() => {
    loadVideos(page, videoStatusFilter);
  }, [page, videoStatusFilter, loadVideos]);

  const handleSearchResults = useCallback(
    (results: AdminVideo[], meta: { hasNext: boolean }) => {
      const statusDefault = resolveStatusValue(videoStatusFilter);
      applySearchResults(results, meta, {
        defaults: {
          videoStatus: statusDefault,
          selected: true,
        },
        mode: "form",
      });
      setActiveShortcut(null);
    },
    [applySearchResults, videoStatusFilter],
  );

  const handleSearchReset = useCallback(() => {
    searchKeywordRef.current = null;
    setCurrentSearchKeyword(null);
    setSearchSelectionDefaults(null);
    setSearchContext(null);
    setActiveShortcut(null);
    loadVideos(page, videoStatusFilter);
  }, [loadVideos, page, videoStatusFilter]);

  const fetchVideosByKeyword = useCallback(async (
    keyword: string,
    pageNumber = 1,
    statusFilter: number,
  ) => {
    const searchParams = new URLSearchParams();
    searchParams.set("page", String(pageNumber));
    searchParams.set("video_status", String(statusFilter));
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
      const statusDefault = resolveStatusValue(videoStatusFilter);
      setSearchSelectionDefaults({
        videoStatus: statusDefault,
        selected: true,
      });
      const data = await fetchVideosByKeyword(keyword, 1, videoStatusFilter);
      return { items: data.videos, hasNext: Boolean(data.hasNext) };
    },
    [fetchVideosByKeyword, videoStatusFilter],
  );

  const filteredVideos = useMemo(() => videos, [videos]);

  const selectedCount = useMemo(
    () =>
      filteredVideos.filter((video) => {
        const entry = selections[video.id];
        return entry ? entry.selected : false;
      }).length,
    [filteredVideos, selections],
  );

  const areAllVisibleSelected =
    filteredVideos.length > 0 && selectedCount === filteredVideos.length;

  const hasPrev = currentPage > 1;
  const effectiveHasPrev = searchContext ? currentPage > 1 : hasPrev;
  const effectiveHasNext = hasNextPage;

  const handleToggleAll = useCallback(
    (checked: boolean) => {
      setSelections((prev) => {
        const next: Record<string, VideoSelection> = { ...prev };
        for (const video of filteredVideos) {
          const fallback =
            next[video.id] ??
            {
              selected: true,
              videoStatus: resolveStatusValue(videoStatusFilter),
            };
          next[video.id] = {
            ...fallback,
            selected: checked,
          };
        }
        return next;
      });
    },
    [filteredVideos, videoStatusFilter],
  );

  const handleShortcutSearch = useCallback(
    async (shortcut: ShortcutKey) => {
      const { keywords = [], filterTitles } = SHORTCUT_CONFIG[shortcut];
      // 同じショートカットを再度押した場合は状態をクリアし、通常の一覧へ戻します。
      if (searchContext === "shortcut" && activeShortcut === shortcut) {
        setSearchContext(null);
        setActiveShortcut(null);
        setCurrentSearchKeyword(null);
        setSearchSelectionDefaults(null);
        searchKeywordRef.current = null;
        await loadVideos(1, videoStatusFilter);
        return;
      }

      setLoading(true);
      const defaults: SelectionDefaults = {
        videoStatus: resolveStatusValue(videoStatusFilter),
        selected: true,
      };
      try {
        const keywordLabel =
          keywords.length > 0 ? keywords.join(" / ") : filterTitles ? "タイトルあり" : "";
        searchKeywordRef.current = keywordLabel;
        setCurrentSearchKeyword(keywordLabel);
        setSearchSelectionDefaults(defaults);
        setSearchContext("shortcut");
        const merged = new Map<string, AdminVideo>();
        let combinedHasNext = false;
        const shortcutsToRun = keywords.length > 0 ? keywords : [""];
        for (const keyword of shortcutsToRun) {
          const data = await fetchVideosByKeyword(keyword, 1, videoStatusFilter);
          for (const video of data.videos) {
            merged.set(video.id, video);
          }
          combinedHasNext = combinedHasNext || Boolean(data.hasNext);
        }
        let combinedVideos = Array.from(merged.values());
        if (filterTitles) {
          combinedVideos = combinedVideos.filter((video) => filterTitles.test(video.title));
        }
        applySearchResults(
          combinedVideos,
          { hasNext: combinedHasNext },
          { defaults, mode: "shortcut" },
        );
        setActiveShortcut(shortcut);
        if (combinedVideos.length === 0) {
          toast.info("該当する動画が見つかりませんでした。");
        }
      } catch (error) {
        const fallback =
          error instanceof Error ? error.message : "検索に失敗しました。再度お試しください。";
        toast.error(fallback);
        setActiveShortcut(null);
      } finally {
        setLoading(false);
      }
    },
    [
      fetchVideosByKeyword,
      applySearchResults,
      videoStatusFilter,
      searchContext,
      activeShortcut,
      loadVideos,
    ],
  );

  const runAutoCategorization = useCallback(async () => {
    setAutoCategorizing(true);
    try {
      const response = await fetch("/api/admin/videos/auto-categorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: autoCategorizeLimit }),
      });
      const result = (await response.json()) as { scanned?: number; updated?: number; message?: string };
      if (!response.ok) {
        const message =
          typeof result?.message === "string" ? result.message : "自動分類の実行に失敗しました。";
        toast.error(message);
        setAutoCategorizing(false);
        return;
      }
      toast.success(`自動分類を実行しました (検査 ${result.scanned ?? 0} 件 / 更新 ${result.updated ?? 0} 件)`);
      await loadVideos(currentPage, videoStatusFilter);
    } catch (error) {
      const fallback =
        error instanceof Error ? error.message : "自動分類の実行中にエラーが発生しました。";
      toast.error(fallback);
    } finally {
      setAutoCategorizing(false);
    }
  }, [autoCategorizeLimit, currentPage, loadVideos, videoStatusFilter]);

  const handleShortcutSelectChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value as "" | ShortcutKey;
      if (value === "") {
        if (searchContext === "shortcut") {
          setSearchContext(null);
          setActiveShortcut(null);
          setCurrentSearchKeyword(null);
          setSearchSelectionDefaults(null);
          searchKeywordRef.current = null;
          void loadVideos(1, videoStatusFilter);
        }
        return;
      }
      void handleShortcutSearch(value);
    },
    [handleShortcutSearch, loadVideos, searchContext, videoStatusFilter],
  );

  const isPendingFilter = videoStatusFilter === 0;
  const isOkFilter = videoStatusFilter === 1;
  const isNgFilter = videoStatusFilter === 2;
  const isAiOkFilter = videoStatusFilter === 3;
  const isAiNgFilter = videoStatusFilter === 4;
  const defaultFilterHref = "/admin/videos";
  const buildStatusHref = (status: number) => {
    const params = new URLSearchParams();
    if (status !== defaultVideoStatus) {
      params.set("video_status", String(status));
    }
    const query = params.toString();
    return `/admin/videos${query ? `?${query}` : ""}`;
  };
  const pendingFilterHref = buildStatusHref(0);
  const okFilterHref = buildStatusHref(1);
  const ngFilterHref = buildStatusHref(2);
  const aiOkFilterHref = buildStatusHref(3);
  const aiNgFilterHref = buildStatusHref(4);
  const handlePendingFilterClick = () => {
    router.push(isPendingFilter ? defaultFilterHref : pendingFilterHref);
  };
  const handleOkFilterClick = () => {
    router.push(isOkFilter ? defaultFilterHref : okFilterHref);
  };
  const handleNgFilterClick = () => {
    router.push(isNgFilter ? defaultFilterHref : ngFilterHref);
  };
  const handleAiOkFilterClick = () => {
    router.push(isAiOkFilter ? defaultFilterHref : aiOkFilterHref);
  };
  const handleAiNgFilterClick = () => {
    router.push(isAiNgFilter ? defaultFilterHref : aiNgFilterHref);
  };

  const shortcutSelectValue: "" | ShortcutKey =
    searchContext === "shortcut" && activeShortcut ? activeShortcut : "";

  const loadSearchPage = useCallback(
    async (targetPage: number) => {
      if (!currentSearchKeyword || !searchContext) return;
      searchKeywordRef.current = currentSearchKeyword;
      setLoading(true);
      try {
        const data = await fetchVideosByKeyword(
          currentSearchKeyword,
          targetPage,
          videoStatusFilter,
        );
        setVideos(data.videos);
        setCurrentPage(typeof data.page === "number" ? data.page : targetPage);
        const defaults: SelectionDefaults = {
          videoStatus: resolveStatusValue(videoStatusFilter),
          selected: true,
          ...(searchSelectionDefaults ?? {}),
        };
        defaults.selected = true;
        setSelections(
          createInitialSelections(data.videos, defaults),
        );
        setHasNextPage(Boolean(data.hasNext));
        if (data.videos.length === 0) {
          toast.info("該当する動画が見つかりませんでした。");
        }
      } catch (error) {
        const fallback =
          error instanceof Error ? error.message : "検索結果の取得に失敗しました。";
        toast.error(fallback);
      } finally {
        setLoading(false);
      }
    },
    [
      currentSearchKeyword,
      searchContext,
      fetchVideosByKeyword,
      createInitialSelections,
      searchSelectionDefaults,
      videoStatusFilter,
    ],
  );

  const handleSubmit = async () => {
    // 選択済みの行だけを丁寧にリクエスト形式へ整えます。
    const selectedEntries = Object.entries(selections).filter(([, entry]) => entry.selected);

    if (selectedEntries.length === 0) {
      toast.error("更新対象の行を選択してください。");
      return;
    }

    const items = selectedEntries.map(([id, entry]) => ({
      id,
      video_status: Number(entry.videoStatus),
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
        toast.error(errorMessage);
        return;
      }
      const successMessage =
        typeof data?.message === "string" && data.message.trim() !== ""
          ? data.message
          : `動画の更新が完了しました。（${data?.processed ?? items.length}件）`;
      toast.success(successMessage);
      setSelections((prev) => {
        const next: Record<string, VideoSelection> = {};
        for (const video of videos) {
          next[video.id] = {
            ...(prev[video.id] ?? {
              videoStatus: resolveStatusValue(videoStatusFilter),
            }),
            selected: true,
          };
        }
        return next;
      });
      if (searchContext) {
        // ショートカット等で検索中の場合は同じ条件で丁寧に再読み込みし、設定を維持します。
        await loadSearchPage(currentPage);
      } else {
        await loadVideos(currentPage, videoStatusFilter);
      }
    } catch (error) {
      const fallback =
        error instanceof Error ? error.message : "動画更新中に予期せぬエラーが発生しました。";
      toast.error(fallback);
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
    const params = new URLSearchParams();
    if (targetPage > 1) {
      params.set("page", String(targetPage));
    }
    if (videoStatusFilter !== defaultVideoStatus) {
      params.set("video_status", String(videoStatusFilter));
    }
    const query = params.toString();
    router.push(`/admin/videos${query ? `?${query}` : ""}`);
  };

  return (
    <>
      <AdminTabsLayout activeTab="videos">
      {errorMessage ? (
        <p className={styles.errorMessage}>
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
          {/* LLM判定状況ごとに一覧を切り替えるボタンを用意し、status=1/2 を素早く絞り込めるようにします。 */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePendingFilterClick}
              className={`${styles.filterButton} ${isPendingFilter ? styles.buttonActiveAmber : ""}`}
            >
              未判定
            </button>
            <button
              type="button"
              onClick={handleAiOkFilterClick}
              className={`${styles.filterButton} ${isAiOkFilter ? styles.buttonActiveGreen : ""}`}
            >
              AI-OK
            </button>
            <button
              type="button"
              onClick={handleAiNgFilterClick}
              className={`${styles.filterButton} ${isAiNgFilter ? styles.buttonActiveAmber : ""}`}
            >
              AI-NG
            </button>
            <button
              type="button"
              onClick={handleOkFilterClick}
              className={`${styles.filterButton} ${isOkFilter ? styles.buttonActiveBlue : ""}`}
            >
              OK
            </button>
            <button
              type="button"
              onClick={handleNgFilterClick}
              className={`${styles.filterButton} ${isNgFilter ? styles.buttonActiveRed : ""}`}
            >
              NG
            </button>
          </div>
          {/* よく使う漫才・コント・ネタ検索をドロップダウンで提供し、選択と解除を簡潔にします。 */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="auto-categorize-limit">
              自動分類の対象件数
            </label>
            <select
              id="auto-categorize-limit"
              value={autoCategorizeLimit}
              onChange={(event) => setAutoCategorizeLimit(Number(event.target.value))}
              className={`${styles.selectControl} ${styles.filterSelect}`}
              disabled={autoCategorizing || loading}
              aria-label="自動分類の対象件数を選択"
            >
              {[30, 50, 100, 200, 300, 400, 500].map((option) => (
                <option key={option} value={option}>
                  {option} 件
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={runAutoCategorization}
              className={styles.filterButton}
              disabled={autoCategorizing || loading}
            >
              {autoCategorizing ? "自動分類中…" : "自動分類を実行"}
            </button>
            <label className="sr-only" htmlFor="shortcut-select">
              ショートカット検索
            </label>
            <select
              id="shortcut-select"
              value={shortcutSelectValue}
              onChange={handleShortcutSelectChange}
              disabled={loading}
              className={`${styles.selectControl} ${styles.filterSelect}`}
              aria-label="ショートカット検索を選択"
            >
              <option value="">ショートカットを選択</option>
              {Object.entries(SHORTCUT_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.label}
                </option>
              ))}
            </select>
          </div>
          {loading ? (
            <p className={styles.feedbackCard}>読み込み中です…</p>
          ) : filteredVideos.length === 0 ? (
            <p className={styles.feedbackCard}>表示できる動画がありません。</p>
          ) : (
            // テーブルではなくカード型の 5 列グリッドへ並び替え、視線移動を最小限にして操作をしやすくします。
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredVideos.map((video) => {
                const entry = selections[video.id] ?? {
                  selected: true,
                  videoStatus: resolveStatusValue(videoStatusFilter),
                };
                return (
                  <article key={video.id} className={styles.videoCard}>
                    {/* サムネイルを先頭に配置し、視覚情報を最初に確認できるようにします。 */}
                    <div
                      className={styles.thumbnailWrapper}
                      style={{ aspectRatio: "16 / 9" }}
                    >
                      {renderEmbeddedVideo(video, handleThumbnailDialogOpen)}
                    </div>
                    <div className={styles.cardBody}>
                      <div className="flex items-start justify-between gap-3">
                        <label className={`inline-flex flex-1 items-start gap-2 text-sm font-medium ${styles.cardLabel}`}>
                          <input
                            type="checkbox"
                            className={`${styles.checkboxControl} mt-1`}
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
                          <span className="flex flex-col">
                            <a
                              href={video.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.cardLink}
                            >
                              {video.title}
                            </a>
                            <span className={styles.cardChannel}>
                              {video.channel_name || "チャンネル未登録"}
                            </span>
                          </span>
                        </label>
                      </div>
                      {/* タイトル群をサムネイル直下へ寄せたため、操作コンポーネントも同じラッパー内で整然と並べます。 */}
                      <div className="space-y-2">
                        {/* ステータス選択をラジオボタンへ切り替え、ワンタップで判定を付けやすくします。 */}
                        <fieldset className={styles.radioGroup}>
                          <legend className="sr-only">動画ステータス</legend>
                          <div className={styles.radioOptions}>
                            {VIDEO_STATUS_OPTIONS.map((option) => {
                              const inputId = `video-status-${video.id}-${option.value}`;
                              const isChecked = entry.videoStatus === option.value;
                              return (
                                <label
                                  key={option.value}
                                  htmlFor={inputId}
                                  className={`${styles.radioOption} ${isChecked ? styles.radioOptionActive : ""}`}
                                >
                                  <input
                                    type="radio"
                                    id={inputId}
                                    name={`video-status-${video.id}`}
                                    className={styles.radioInput}
                                    value={option.value}
                                    checked={isChecked}
                                    onChange={(event) =>
                                      setSelections((prev) => ({
                                        ...prev,
                                        [video.id]: {
                                          ...entry,
                                          videoStatus: event.target.value,
                                        },
                                      }))
                                    }
                                  />
                                  <span>{option.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="lg:hidden">
            <ListFooter
              paging={{
                currentPage,
                hasPrev: effectiveHasPrev,
                hasNext: effectiveHasNext,
                onPrev: effectiveHasPrev ? () => goToPage(currentPage - 1) : undefined,
                onNext: effectiveHasNext ? () => goToPage(currentPage + 1) : undefined,
              }}
              headerContent={
                <div className={`flex flex-1 flex-wrap items-center justify-between gap-3 ${styles.headerText}`}>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        className={styles.checkboxControl}
                        checked={areAllVisibleSelected}
                        onChange={(event) => handleToggleAll(event.target.checked)}
                        aria-label="全て選択"
                        disabled={loading || filteredVideos.length === 0}
                      />
                      全て選択
                    </label>
                    <span className={styles.metaText}>
                      選択中: {selectedCount} / {filteredVideos.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading || submitting || videos.length === 0}
                    className={styles.primaryButton}
                  >
                    {submitting ? "送信中…" : "更新"}
                  </button>
                </div>
              }
            />
          </div>

          <div className="hidden lg:block">
            {/* 大画面では更新ボタンとページングを同列にまとめ、操作フローを見通し良く保ちます。 */}
            <div className={styles.desktopFooterCard}>
              <div className="flex flex-wrap items-center justify-between gap-6">
                <div className={`flex flex-wrap items-center gap-3 text-sm ${styles.headerText}`}>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className={styles.checkboxControl}
                      checked={areAllVisibleSelected}
                      onChange={(event) => handleToggleAll(event.target.checked)}
                      aria-label="全て選択"
                      disabled={loading || filteredVideos.length === 0}
                    />
                    全て選択
                  </label>
                  <span className={styles.metaText}>選択中: {selectedCount} / {filteredVideos.length}</span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-4">
                  {/* ページング操作も併記し、前後移動を即座に実行できます。 */}
                  <div className={styles.pagerSection}>
                    <span>ページ {currentPage}</span>
                    <div className={styles.pagerControls}>
                      {effectiveHasPrev ? (
                        <button
                          type="button"
                          onClick={() => goToPage(currentPage - 1)}
                          className={styles.pagerControl}
                          aria-label="前のページ"
                        >
                          <span className="material-symbols-rounded" aria-hidden="true">
                            arrow_back
                          </span>
                        </button>
                      ) : (
                        <span className={styles.pagerControlDisabled}>
                          <span className="material-symbols-rounded" aria-hidden="true">
                            arrow_back
                          </span>
                          <span className="sr-only">前のページ</span>
                        </span>
                      )}
                      {effectiveHasNext ? (
                        <button
                          type="button"
                          onClick={() => goToPage(currentPage + 1)}
                          className={styles.pagerControl}
                          aria-label="次のページ"
                        >
                          <span className="material-symbols-rounded" aria-hidden="true">
                            arrow_forward
                          </span>
                        </button>
                      ) : (
                        <span className={styles.pagerControlDisabled}>
                          <span className="material-symbols-rounded" aria-hidden="true">
                            arrow_forward
                          </span>
                          <span className="sr-only">次のページ</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading || submitting || videos.length === 0}
                    className={styles.primaryButton}
                  >
                    {submitting ? "送信中…" : "更新"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </AdminTabsLayout>
      {/* サムネイル押下で指定された動画をその場で再生できるようモーダルを常駐させます。 */}
      <VideoDialog video={dialogVideo} onClose={handleDialogClose} />
    </>
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

function renderEmbeddedVideo(
  video: AdminVideo,
  openDialog: (video: AdminVideo, videoId: string) => void,
) {
  const videoId = extractYouTubeVideoId(video.url);
  if (!videoId) {
    return (
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex h-full items-center justify-center ${styles.cardLink}`}
      >
        開く
      </a>
    );
  }
  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  // 動画詳細はモーダルで再生するため、ボタン押下をトリガーにダイアログを開きます。
  return (
    <button
      type="button"
      onClick={() => openDialog(video, videoId)}
      className={`${styles.thumbnailLink} ${styles.thumbnailButton}`}
      aria-label={`${video.title} を再生`}
    >
      <Image
        src={thumbnailUrl}
        alt={video.title}
        fill
        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
        className={styles.thumbnailImage}
      />
    </button>
  );
}
