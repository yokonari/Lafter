"use client";

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
  category?: number | null;
};

type AdminVideosResponse = {
  videos: Array<
    AdminVideo & {
      category?: number | null;
    }
  >;
  page: number;
  limit: number;
  hasNext: boolean;
};

type SelectionDefaults = {
  videoStatus: string;
  videoCategory: string;
  selected?: boolean;
};

type VideoSelection = {
  selected: boolean;
  videoStatus: string;
  videoCategory: string;
};

const VIDEO_STATUS_OPTIONS = [
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

const CATEGORY_FILTER_OPTIONS = [
  { value: "all", label: "全カテゴリ" },
  ...VIDEO_CATEGORY_OPTIONS,
];

type ShortcutConfig = {
  label: string;
  keywords?: string[];
  category: string;
  filterTitles?: RegExp;
};

const SHORTCUT_CONFIG: Record<string, ShortcutConfig> = {
  manzai: { label: "漫才", keywords: ["漫才"], category: "1" },
  conte: { label: "コント", keywords: ["コント"], category: "2" },
  neta: { label: "ネタ", keywords: ["ネタ"], category: "1" },
  variety: {
    label: "ものまね / モノマネ / 歌 / あるある",
    keywords: ["ものまね", "モノマネ", "歌", "あるある"],
    category: "1",
  },
  titled: {
    label: "タイトルあり",
    keywords: [],
    category: "1",
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
  const [categoryFilter, setCategoryFilter] = useState<string>("0"); // 初期状態では未分類のみを表示し、必要に応じて他カテゴリへ切り替えます。
  const categoryFilterRef = useRef(categoryFilter);
  useEffect(() => {
    // フィルタ変更時の最新値を保持し、API 再取得時に取りこぼさないようにいたします。
    categoryFilterRef.current = categoryFilter;
  }, [categoryFilter]);

  const resolveStatusValue = (value?: number | string | null) => {
    const numeric =
      typeof value === "string"
        ? Number(value)
        : typeof value === "number"
          ? value
          : undefined;
    if (numeric === 1 || numeric === 2) {
      return String(numeric);
    }
    return "1";
  };

  const createInitialSelections = useCallback(
    (rows: AdminVideo[], defaults?: SelectionDefaults) => {
      const statusDefault = resolveStatusValue(defaults?.videoStatus ?? videoStatusFilter);
      const categoryDefault = defaults?.videoCategory ?? "0";
      const selectedDefault = defaults?.selected ?? true;
      const next: Record<string, VideoSelection> = {};
      for (const row of rows) {
        const existingCategory =
          typeof row.category === "number" && row.category > 0
            ? String(row.category)
            : categoryDefault;
        next[row.id] = {
          selected: selectedDefault,
          videoStatus: statusDefault,
          videoCategory: existingCategory,
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
    async (targetPage: number, statusFilter: number, categoryValue?: string) => {
      setLoading(true);
      setErrorMessage(null);
      const activeCategory = categoryValue ?? categoryFilterRef.current ?? "all";
      try {
        const search = new URLSearchParams();
        if (targetPage > 1) {
          search.set("page", String(targetPage));
        }
        search.set("video_status", String(statusFilter));
        const categoryParam = activeCategory === "all" ? null : activeCategory;
        if (categoryParam !== null) {
          search.set("category", categoryParam);
        }
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
        const defaultCategoryForSelection = categoryParam === null ? "0" : categoryParam;
        setSelections(
          createInitialSelections(data.videos, {
            videoStatus: defaultStatusForSelection,
            videoCategory: defaultCategoryForSelection,
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
          videoCategory: "1",
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
    categoryValue?: string,
  ) => {
    const activeCategory = categoryValue ?? categoryFilterRef.current ?? "all";
    const searchParams = new URLSearchParams();
    searchParams.set("page", String(pageNumber));
    searchParams.set("video_status", String(statusFilter));
    const trimmed = keyword.trim();
    if (trimmed) {
      searchParams.set("q", trimmed);
    }
    const categoryParam = activeCategory === "all" ? null : activeCategory;
    if (categoryParam !== null) {
      searchParams.set("category", categoryParam);
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
        videoCategory: "1",
        selected: true,
      });
      const data = await fetchVideosByKeyword(keyword, 1, videoStatusFilter);
      return { items: data.videos, hasNext: Boolean(data.hasNext) };
    },
    [fetchVideosByKeyword, videoStatusFilter],
  );

  const filteredVideos = useMemo(() => {
    if (categoryFilter === "all") {
      return videos;
    }
    return videos.filter((video) => String(video.category ?? 0) === categoryFilter);
  }, [videos, categoryFilter]);

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
              videoCategory:
                typeof video.category === "number" && video.category > 0
                  ? String(video.category)
                  : "0",
            };
          next[video.id] = {
            ...fallback,
            selected: checked,
          };
        }
        return next;
      });
    },
    [filteredVideos],
  );

  const handleShortcutSearch = useCallback(
    async (shortcut: ShortcutKey) => {
      const { keywords = [], category: videoCategoryDefault, filterTitles } = SHORTCUT_CONFIG[shortcut];
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
        videoCategory: videoCategoryDefault,
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
    async (targetPage: number, categoryValue?: string) => {
      if (!currentSearchKeyword || !searchContext) return;
      searchKeywordRef.current = currentSearchKeyword;
      setLoading(true);
      try {
        const activeCategory = categoryValue ?? categoryFilterRef.current ?? "all";
        const data = await fetchVideosByKeyword(
          currentSearchKeyword,
          targetPage,
          videoStatusFilter,
          activeCategory,
        );
        setVideos(data.videos);
        setCurrentPage(typeof data.page === "number" ? data.page : targetPage);
        const defaults: SelectionDefaults = {
          videoStatus: resolveStatusValue(videoStatusFilter),
          videoCategory: "1",
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

  const handleCategoryFilterChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextValue = event.target.value;
      setCategoryFilter(nextValue);
      if (searchContext && currentSearchKeyword) {
        void loadSearchPage(1, nextValue);
        return;
      }
      void loadVideos(currentPage, videoStatusFilter, nextValue);
    },
    [searchContext, currentSearchKeyword, loadSearchPage, loadVideos, currentPage, videoStatusFilter],
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
          const fallbackCategory =
            typeof video.category === "number" && video.category > 0
              ? String(video.category)
              : "0";
          next[video.id] = {
            ...(prev[video.id] ?? {
              videoStatus: resolveStatusValue(videoStatusFilter),
              videoCategory: fallbackCategory,
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
              onClick={() => router.push(isAiOkFilter ? defaultFilterHref : aiOkFilterHref)}
              className={`${styles.filterButton} ${isAiOkFilter ? styles.buttonActiveGreen : ""}`}
            >
              AI-OK
            </button>
            <button
              type="button"
              onClick={() => router.push(isAiNgFilter ? defaultFilterHref : aiNgFilterHref)}
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
            {/* カテゴリごとの絞り込みも同列に配置し、ショートカットと併せて直感的に操作できるようにします。 */}
            <select
              value={categoryFilter}
              onChange={handleCategoryFilterChange}
              className={`${styles.selectControl} ${styles.filterSelect}`}
              disabled={loading}
              aria-label="カテゴリでフィルタ"
            >
              {CATEGORY_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
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
                  videoCategory:
                    typeof video.category === "number" && video.category > 0
                      ? String(video.category)
                      : "0",
                };
                return (
                  <article key={video.id} className={styles.videoCard}>
                    {/* サムネイルを先頭に配置し、視覚情報を最初に確認できるようにします。 */}
                    <div
                      className={styles.thumbnailWrapper}
                      style={{ aspectRatio: "16 / 9" }}
                    >
                      {renderEmbeddedVideo(video)}
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
                        <div className="flex items-center gap-2 text-sm">
                          <div className={entry.videoStatus === "2" ? "w-full" : "w-1/2"}>
                            <label htmlFor={`video-status-${video.id}`} className="sr-only">
                              動画ステータス
                            </label>
                            <select
                              id={`video-status-${video.id}`}
                              className={`${styles.selectControl} ${styles.cardSelect}`}
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
                          {entry.videoStatus !== "2" ? (
                            <div className="w-1/2">
                              <label htmlFor={`video-category-${video.id}`} className="sr-only">
                                動画カテゴリ
                              </label>
                              <select
                                id={`video-category-${video.id}`}
                                className={`${styles.selectControl} ${styles.cardSelect}`}
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
                          ) : null}
                        </div>
                        {entry.videoStatus === "2" ? (
                          <p className={styles.cardHint}>NG のためカテゴリ設定は不要です。</p>
                        ) : null}
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
        className={`flex h-full items-center justify-center ${styles.cardLink}`}
      >
        開く
      </a>
    );
  }
  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  // YouTube 埋め込みの代わりに軽量なサムネイルを表示し、クリックで本編へ遷移できるようにします。
  return (
    <a
      href={`https://www.youtube.com/watch?v=${videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block h-full w-full"
      aria-label={`${video.title} を開く`}
    >
      <img
        src={thumbnailUrl}
        alt={video.title}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    </a>
  );
}
