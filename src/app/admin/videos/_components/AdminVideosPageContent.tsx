"use client";

import Image from "next/image";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
} from "react";
import { PlayCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { VideoDialog } from "@/components/user/VideoDialog";
import type { VideoItem } from "@/lib/videoService";
import { REPORT_REASONS } from "@/lib/reportReasons";
import { AdminTabsLayout } from "../../components/AdminTabsLayout";
import { SearchForm } from "../../components/SearchForm";
import { ListFooter } from "../../components/ListFooter";
import { toast } from "react-toastify";
import styles from "../../adminTheme.module.scss";

export type AdminVideo = {
    id: string;
    url: string;
    title: string;
    channel_name: string;
    status?: number;
    report_status?: number;
};

type AdminVideosResponse = {
    videos: AdminVideo[];
    page: number;
    limit: number;
    hasNext: boolean;
    totalCount: number;
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
    { value: "1", label: "OK" as const },
    { value: "2", label: "NG" as const },
];

const REPORT_STATUS_LABELS = REPORT_REASONS.reduce<Record<number, string>>((acc, reason) => {
    acc[reason.status] = reason.label;
    return acc;
}, {});

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

const getReportStatusText = (reportStatus?: number) => {
    if (typeof reportStatus !== "number" || reportStatus <= 0) {
        return "報告なし";
    }
    return REPORT_STATUS_LABELS[reportStatus] ?? "報告あり";
};

export default function AdminVideosPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pageParam = searchParams.get("page");
    const parsedPage = pageParam ? Number(pageParam) : 1;
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
    const videoStatusParam = searchParams.get("video_status");
    const parsedStatusFilter = videoStatusParam ? Number(videoStatusParam) : defaultVideoStatus;
    const normalizedVideoStatusFilter =
        Number.isFinite(parsedStatusFilter) && parsedStatusFilter >= 0 && parsedStatusFilter <= 4
            ? Math.floor(parsedStatusFilter)
            : defaultVideoStatus;
    const reportedOnlyParam = searchParams.get("reported_only");
    const reportedOnlyFilter = reportedOnlyParam === "1";
    const videoStatusFilter = reportedOnlyFilter ? 1 : normalizedVideoStatusFilter;

    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [videos, setVideos] = useState<AdminVideo[]>([]);
    const [currentPage, setCurrentPage] = useState(page);
    const [selections, setSelections] = useState<Record<string, VideoSelection>>({});
    const [submitting, setSubmitting] = useState(false);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [searchContext, setSearchContext] = useState<"form" | "shortcut" | null>(null);
    const [currentSearchKeyword, setCurrentSearchKeyword] = useState<string | null>(null);
    const [searchSelectionDefaults, setSearchSelectionDefaults] = useState<SelectionDefaults | null>(null);
    const searchKeywordRef = useRef<string | null>(null);
    // ショートカット検索 UI は一時停止中ですが、再開を見据えて状態を保持するため lint を抑制します。
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [activeShortcut, setActiveShortcut] = useState<ShortcutKey | null>(null);
    // 自動分類機能も現在はコメントアウト中のため、状態だけ定義して lint を抑止します。
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [autoCategorizing, setAutoCategorizing] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
            title: video.title,
            thumbnail: thumbnailUrl,
            channelName: video.channel_name,
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
            meta: { hasNext: boolean; totalCount?: number },
            options?: { defaults?: SelectionDefaults; mode?: "form" | "shortcut" | null },
        ) => {
            setVideos(results);
            setSelections(createInitialSelections(results, options?.defaults));
            setCurrentPage(1);
            setHasNextPage(Boolean(meta.hasNext));
            if (typeof meta.totalCount === "number") {
                setTotalCount(meta.totalCount);
            }
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
        async (targetPage: number, statusFilter: number, reportedOnly = reportedOnlyFilter) => {
            setLoading(true);
            setErrorMessage(null);
            try {
                const search = new URLSearchParams();
                if (targetPage > 1) {
                    search.set("page", String(targetPage));
                }
                search.set("video_status", String(statusFilter));
                if (reportedOnly) {
                    search.set("reported_only", "1");
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
                setSelections(
                    createInitialSelections(data.videos, {
                        videoStatus: defaultStatusForSelection,
                        selected: true,
                    }),
                );
                setHasNextPage(Boolean(data.hasNext));
                setTotalCount(data.totalCount);
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
        [createInitialSelections, reportedOnlyFilter],
    );

    useEffect(() => {
        loadVideos(page, videoStatusFilter, reportedOnlyFilter);
    }, [page, videoStatusFilter, reportedOnlyFilter, loadVideos]);

    const handleSearchResults = useCallback(
        (results: AdminVideo[], meta: { hasNext: boolean; totalCount?: number }) => {
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
        loadVideos(page, videoStatusFilter, reportedOnlyFilter);
    }, [loadVideos, page, reportedOnlyFilter, videoStatusFilter]);

    const fetchVideosByKeyword = useCallback(async (
        keyword: string,
        pageNumber = 1,
        statusFilter: number,
        reportedOnly = reportedOnlyFilter,
    ) => {
        const searchParams = new URLSearchParams();
        searchParams.set("page", String(pageNumber));
        searchParams.set("video_status", String(statusFilter));
        if (reportedOnly) {
            searchParams.set("reported_only", "1");
        }
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
    }, [reportedOnlyFilter]);

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
            const data = await fetchVideosByKeyword(keyword, 1, videoStatusFilter, reportedOnlyFilter);
            return { items: data.videos, hasNext: Boolean(data.hasNext), totalCount: data.totalCount };
        },
        [fetchVideosByKeyword, reportedOnlyFilter, videoStatusFilter],
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
                await loadVideos(1, videoStatusFilter, reportedOnlyFilter);
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
                    const data = await fetchVideosByKeyword(keyword, 1, videoStatusFilter, reportedOnlyFilter);
                    for (const video of data.videos) {
                        merged.set(video.id, video);
                    }
                    combinedHasNext = combinedHasNext || Boolean(data.hasNext);
                }
                let combinedVideos = Array.from(merged.values());
                if (filterTitles) {
                    combinedVideos = combinedVideos.filter((video) => filterTitles.test(video.title));
                }

                // ショートカット検索の場合は正確な総数が不明なため、取得できた件数を表示します。
                applySearchResults(
                    combinedVideos,
                    { hasNext: combinedHasNext, totalCount: combinedVideos.length },
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
            reportedOnlyFilter,
        ],
    );

    // 自動分類エンドポイント呼び出しも現状は UI から到達しないため、警告を回避しつつ実装を保持します。
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const runAutoCategorization = useCallback(async () => {
        setAutoCategorizing(true);
        try {
            // 管理セッション不要の共通エンドポイントに切り替え、ワーカーと同じ経路で自動分類します。
            const response = await fetch("/api/videos/auto-categorize", {
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
            await loadVideos(currentPage, videoStatusFilter, reportedOnlyFilter);
        } catch (error) {
            const fallback =
                error instanceof Error ? error.message : "自動分類の実行中にエラーが発生しました。";
            toast.error(fallback);
        } finally {
            setAutoCategorizing(false);
        }
    }, [autoCategorizeLimit, currentPage, loadVideos, reportedOnlyFilter, videoStatusFilter]);

    // ショートカット選択 UI は非表示のため、ハンドラーは再開時まで温存します。
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
                    void loadVideos(1, videoStatusFilter, reportedOnlyFilter);
                }
                return;
            }
            void handleShortcutSearch(value);
        },
        [handleShortcutSearch, loadVideos, reportedOnlyFilter, searchContext, videoStatusFilter],
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
    const handleReportedFilterClick = () => {
        if (reportedOnlyFilter) {
            router.push(defaultFilterHref);
            return;
        }
        // 報告フィルター有効時は OK ステータスと報告済みのみを取り出せるようクエリを固定します。
        const params = new URLSearchParams();
        params.set("video_status", "1");
        params.set("reported_only", "1");
        const query = params.toString();
        router.push(`/admin/videos${query ? `?${query}` : ""}`);
    };
    const isReportedFilter = reportedOnlyFilter;
    const showStatusBadges = isReportedFilter;

    // ドロップダウン非表示のため、一時的に未使用となる値も lint を抑制して残します。
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
                    reportedOnlyFilter,
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
                setTotalCount(data.totalCount);
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
            reportedOnlyFilter,
        ],
    );

    const handleSubmit = async () => {
        // 選択済みの行だけを丁寧にリクエスト形式へ整えます。
        const selectedEntries = Object.entries(selections).filter(([, entry]) => entry.selected);

        const items = selectedEntries
            .map(([id, entry]) => {
                const currentStatus = Number(entry.videoStatus);
                // 現在のリストは videoStatusFilter で絞り込まれているため、
                // これを元のステータスとみなして差分判定を行います。
                if (currentStatus === videoStatusFilter) {
                    return null;
                }
                return {
                    id,
                    video_status: currentStatus,
                };
            })
            .filter((item) => item !== null);

        if (items.length === 0) {
            const hasSelections = selectedEntries.length > 0;
            if (hasSelections) {
                toast.info("変更が必要な項目はありません。");
            } else {
                toast.error("更新対象の行を選択してください。");
            }
            return;
        }

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
                await loadVideos(currentPage, videoStatusFilter, reportedOnlyFilter);
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
        if (reportedOnlyFilter) {
            params.set("reported_only", "1");
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
                                未判定{isPendingFilter && !loading && `(${totalCount.toLocaleString()}件)`}
                            </button>
                            <button
                                type="button"
                                onClick={handleAiOkFilterClick}
                                className={`${styles.filterButton} ${isAiOkFilter ? styles.buttonActiveGreen : ""}`}
                            >
                                AI-OK{isAiOkFilter && !loading && `(${totalCount.toLocaleString()}件)`}
                            </button>
                            <button
                                type="button"
                                onClick={handleAiNgFilterClick}
                                className={`${styles.filterButton} ${isAiNgFilter ? styles.buttonActiveAmber : ""}`}
                            >
                                AI-NG{isAiNgFilter && !loading && `(${totalCount.toLocaleString()}件)`}
                            </button>
                            <button
                                type="button"
                                onClick={handleOkFilterClick}
                                className={`${styles.filterButton} ${isOkFilter ? styles.buttonActiveBlue : ""}`}
                            >
                                OK{isOkFilter && !loading && `(${totalCount.toLocaleString()}件)`}
                            </button>
                            <button
                                type="button"
                                onClick={handleNgFilterClick}
                                className={`${styles.filterButton} ${isNgFilter ? styles.buttonActiveRed : ""}`}
                            >
                                NG{isNgFilter && !loading && `(${totalCount.toLocaleString()}件)`}
                            </button>
                            {/* 報告有無のフィルターを用意し、報告対応をすぐ抽出できるようにします。 */}
                            <button
                                type="button"
                                onClick={handleReportedFilterClick}
                                className={`${styles.filterButton} ${isReportedFilter ? styles.buttonActiveAmber : ""}`}
                            >
                                報告あり{isReportedFilter && !loading && `(${totalCount.toLocaleString()}件)`}
                            </button>
                        </div>
                        {/* よく使う漫才・コント・ネタ検索をドロップダウンで提供し、選択と解除を簡潔にします。 */}
                        {/* 一旦コメントアウトにします。削除しないでください。 */}
                        {/* <div className="flex flex-wrap items-center gap-2">
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
                                {[0, 30, 50, 100, 200, 300, 400, 500].map((option) => (
                                    <option key={option} value={option}>
                                        {option === 0 ? "上限なし" : `${option} 件`}
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
                        </div> */}
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
                                    const reportStatusValue =
                                        typeof video.report_status === "number" ? video.report_status : 0;
                                    const reportStatusText = getReportStatusText(reportStatusValue);
                                    const hasReport = reportStatusValue > 0;
                                    const reportStatusClass = hasReport
                                        ? "border-amber-400 text-amber-200"
                                        : "border-slate-700 text-slate-400";
                                    return (
                                        <article key={video.id} className={styles.videoCard}>
                                            {/* サムネイルを先頭に配置し、視覚情報を最初に確認できるようにします。 */}
                                            <div
                                                className={styles.thumbnailWrapper}
                                                style={{ aspectRatio: "16 / 9" }}
                                                onClick={() => handleThumbnailDialogOpen(video, video.id)}
                                            >
                                                <Image
                                                    src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
                                                    alt={video.title}
                                                    fill
                                                    sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
                                                    className={styles.thumbnailImage}
                                                />
                                                <div className={styles.thumbnailOverlay}>
                                                    <PlayCircle aria-hidden="true" className="text-white" size={34} strokeWidth={1.75} />
                                                </div>
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
                                                                    [video.id]: { ...entry, selected: event.target.checked },
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
                                                            <span className={styles.cardMeta}>{video.channel_name}</span>
                                                        </span>
                                                    </label>
                                                </div>
                                                {/* タイトル直下にフォームを置き、視線移動をスムーズにします。 */}
                                                {showStatusBadges && (
                                                    // 報告ありフィルター時のみ報告バッジを表示し、対応動画に集中できるようにします。
                                                    <div className="flex flex-wrap gap-2 text-xs">
                                                        <span
                                                            className={`${styles.cardMeta} inline-flex items-center gap-1 rounded-full border px-2 py-1 ${reportStatusClass}`}
                                                        >
                                                            <span className="font-semibold">報告</span>
                                                            {reportStatusText}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="space-y-2">
                                                    {/* ラジオボタンで OK/NG を即決できるようにし、クリック数を減らします。 */}
                                                    <fieldset className={styles.radioGroup}>
                                                        <legend className="sr-only">ステータス</legend>
                                                        <div className={styles.radioOptions}>
                                                            {VIDEO_STATUS_OPTIONS.map((option) => {
                                                                const inputId = `video-status-${video.id}-${option.value}`;
                                                                const isChecked = entry.videoStatus === option.value;
                                                                const activeClass =
                                                                    isChecked && option.value === "1"
                                                                        ? styles.radioOptionOkActive
                                                                        : isChecked && option.value === "2"
                                                                            ? styles.radioOptionNgActive
                                                                            : "";
                                                                return (
                                                                    <label
                                                                        key={option.value}
                                                                        htmlFor={inputId}
                                                                        className={`${styles.radioOption} ${activeClass}`}
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
                        <ListFooter
                            paging={{
                                currentPage,
                                hasPrev: effectiveHasPrev,
                                hasNext: effectiveHasNext,
                                onPrev: effectiveHasPrev ? () => goToPage(currentPage - 1) : undefined,
                                onNext: effectiveHasNext ? () => goToPage(currentPage + 1) : undefined,
                            }}
                            bulkControl={{
                                selectedCount,
                                totalCount: filteredVideos.length,
                                onToggleAll: handleToggleAll,
                                onSubmit: handleSubmit,
                                submitting: loading || submitting,
                                disabled: loading || filteredVideos.length === 0,
                            }}
                        />
                    </div>
                )}
            </AdminTabsLayout>
            {dialogVideo && (
                <VideoDialog
                    onClose={handleDialogClose}
                    video={dialogVideo}
                />
            )}
        </>
    );
}
