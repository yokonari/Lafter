"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminTabsLayout } from "../../components/AdminTabsLayout";
import { ListFooter } from "../../components/ListFooter";
import { toast } from "react-toastify";
import type { Id, ToastContent, ToastOptions } from "react-toastify";
import styles from "../../adminTheme.module.scss";

type AdminPlaylist = {
    id: string;
    url: string;
    title: string;
    status: number;
    channel_name?: string;
    top_video_id?: string | null;
};

type AdminPlaylistsResponse = {
    play_lists: AdminPlaylist[];
    page: number;
    limit: number;
    hasNext: boolean;
};

type PlaylistSelection = {
    selected: boolean;
    status: string;
};

const PLAYLIST_STATUS_OPTIONS = [
    { value: "1", label: "OK" as const },
    { value: "2", label: "NG" as const },
];

const defaultPlaylistStatus = 0;
const ADMIN_TOAST_METHODS = ["success", "error", "info", "warn", "warning"] as const;
type AdminToastMethodName = (typeof ADMIN_TOAST_METHODS)[number];
type AdminToastInvoker = <TData = unknown>(content: ToastContent<TData>, options?: ToastOptions<TData>) => Id;
type AdminToastApi = typeof toast & Record<AdminToastMethodName, AdminToastInvoker>;
const adminToastApi = toast as AdminToastApi;
const ADMIN_BOTTOM_RIGHT_TOAST_OPTIONS: ToastOptions = { position: "bottom-right" };

export default function AdminPlaylistsPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pageParam = searchParams.get("page");
    const parsedPage = pageParam ? Number(pageParam) : 1;
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
    const rawStatus = searchParams.get("playlist_status");
    const parsedStatus = rawStatus ? Number(rawStatus) : defaultPlaylistStatus;
    const playlistStatusFilter =
        Number.isInteger(parsedStatus) && parsedStatus >= 0 && parsedStatus <= 2
            ? parsedStatus
            : defaultPlaylistStatus;

    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [playlists, setPlaylists] = useState<AdminPlaylist[]>([]);
    const [currentPage, setCurrentPage] = useState(page);
    const [selections, setSelections] = useState<Record<string, PlaylistSelection>>({});
    const [hasNext, setHasNext] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    // 管理画面の通知位置を右下へ統一し、以降のトーストが常に同じ視線移動で確認できるよう調整します。
    useAdminBottomRightToast();

    const createInitialSelections = useCallback((rows: AdminPlaylist[]) => {
        const next: Record<string, PlaylistSelection> = {};
        for (const row of rows) {
            // 操作の初期状態では常に OK 判定へ揃え、素早く承認しやすいようにいたします。
            next[row.id] = { selected: true, status: "1" };
        }
        return next;
    }, []);
    const loadPlaylists = useCallback(
        async (targetPage: number, statusFilter: number) => {
            setLoading(true);
            setErrorMessage(null);
            setHasNext(false);
            try {
                const params = new URLSearchParams();
                if (targetPage > 1) {
                    params.set("page", String(targetPage));
                }
                if (statusFilter !== defaultPlaylistStatus) {
                    params.set("playlist_status", String(statusFilter));
                }
                const query = params.toString();
                const response = await fetch(`/api/admin/play_lists${query ? `?${query}` : ""}`, {
                    method: "GET",
                    headers: { "Content-Type": "application/json" },
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
                            : `プレイリスト一覧の取得に失敗しました。(HTTP ${response.status})`;
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
                    setPlaylists([]);
                    setSelections({});
                    setHasNext(false);
                    setCurrentPage(targetPage);
                    return;
                }

                if (
                    !payload ||
                    typeof payload !== "object" ||
                    !("play_lists" in payload) ||
                    !Array.isArray((payload as { play_lists: unknown }).play_lists) ||
                    !("page" in payload) ||
                    !("hasNext" in payload)
                ) {
                    throw new Error("取得したプレイリスト一覧の形式が正しくありません。");
                }

                const data = payload as AdminPlaylistsResponse;
                setPlaylists(data.play_lists);
                setCurrentPage(data.page);
                setSelections(createInitialSelections(data.play_lists));
                setHasNext(Boolean(data.hasNext));
            } catch (error) {
                const fallback =
                    error instanceof Error ? error.message : "プレイリスト一覧の取得に失敗しました。";
                setErrorMessage(fallback);
                setPlaylists([]);
                setSelections({});
                setHasNext(false);
                toast.error(fallback);
            } finally {
                setLoading(false);
            }
        },
        [createInitialSelections],
    );

    useEffect(() => {
        loadPlaylists(page, playlistStatusFilter);
    }, [page, playlistStatusFilter, loadPlaylists]);

    const selectedCount = useMemo(
        () => Object.values(selections).filter((item) => item.selected).length,
        [selections],
    );

    const hasPrev = currentPage > 1;
    const isPendingFilter = playlistStatusFilter === 0;
    const isOkFilter = playlistStatusFilter === 1;
    const isNgFilter = playlistStatusFilter === 2;

    const handleToggleAll = (checked: boolean) => {
        const next: Record<string, PlaylistSelection> = {};
        for (const playlist of playlists) {
            const entry = selections[playlist.id] ?? { selected: true, status: "1" };
            next[playlist.id] = { ...entry, selected: checked };
        }
        setSelections(next);
    };

    const buildHref = (targetPage: number, status: number) => {
        const params = new URLSearchParams();
        if (targetPage > 1) {
            params.set("page", String(targetPage));
        }
        if (status !== defaultPlaylistStatus) {
            params.set("playlist_status", String(status));
        }
        const query = params.toString();
        return `/admin/playlists${query ? `?${query}` : ""}`;
    };

    const goToPage = (targetPage: number) => {
        if (targetPage === currentPage) return;
        router.push(buildHref(targetPage, playlistStatusFilter));
    };

    const handlePendingFilterClick = () => {
        router.push(buildHref(1, 0));
    };

    const handleOkFilterClick = () => {
        router.push(buildHref(1, 1));
    };

    const handleNgFilterClick = () => {
        router.push(buildHref(1, 2));
    };

    const handleSubmit = async () => {
        const playlistMap = new Map(playlists.map((p) => [p.id, p]));
        const selectedEntries = Object.entries(selections).filter(([, entry]) => entry.selected);

        const items = selectedEntries
            .map(([id, entry]) => {
                const original = playlistMap.get(id);
                const currentStatus = Number(entry.status);
                if (original && original.status === currentStatus) {
                    return null;
                }
                return {
                    id,
                    status: currentStatus,
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
            const response = await fetch("/api/admin/play_list/bulk", {
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
                        : "プレイリストの更新に失敗しました。";
                toast.error(errorMessage);
                return;
            }
            const successMessage =
                typeof data?.message === "string" && data.message.trim() !== ""
                    ? data.message
                    : `プレイリストの更新が完了しました。（${data?.processed ?? items.length}件）`;
            toast.success(successMessage);
            setSelections((prev) => {
                const next: Record<string, PlaylistSelection> = {};
                for (const playlist of playlists) {
                    next[playlist.id] = {
                        ...(prev[playlist.id] ?? {
                            status: playlist.status === 1 ? "1" : playlist.status === 2 ? "2" : "2",
                        }),
                        selected: true,
                    };
                }
                return next;
            });
            await loadPlaylists(currentPage, playlistStatusFilter);
        } catch (error) {
            const fallback =
                error instanceof Error ? error.message : "プレイリスト更新中に予期せぬエラーが発生しました。";
            toast.error(fallback);
        } finally {
            setSubmitting(false);
        }
    };

    const [checking, setChecking] = useState(false);

    const handleCheckExistence = async () => {
        if (!confirm("プレイリストの存在確認を行いますか？\n（時間がかかる場合があります）")) {
            return;
        }
        setChecking(true);
        try {
            const response = await fetch("/api/admin/playlists/check", {
                method: "POST",
            });
            const data = (await response.json()) as {
                message?: string;
                total?: number;
                checked?: number;
                updated?: number;
                deleted?: number;
            };

            if (!response.ok) {
                throw new Error(data.message || "存在確認に失敗しました。");
            }

            toast.success(
                `確認完了: 全${data.total ?? 0}件中、更新${data.updated ?? 0}件、削除${data.deleted ?? 0}件`
            );
            await loadPlaylists(currentPage, playlistStatusFilter);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "エラーが発生しました。");
        } finally {
            setChecking(false);
        }
    };

    return (
        <AdminTabsLayout activeTab="playlists">
            {errorMessage ? (
                <p className={styles.errorMessage}>
                    {errorMessage}
                </p>
            ) : (
                <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
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
                        <button
                            type="button"
                            onClick={handleCheckExistence}
                            disabled={checking || loading}
                            className={styles.filterButton}
                        >
                            {checking ? "確認中..." : "存在確認"}
                        </button>
                    </div>
                    {loading ? (
                        <p className={styles.feedbackCard}>
                            読み込み中です…
                        </p>
                    ) : playlists.length === 0 ? (
                        <p className={styles.feedbackCard}>
                            表示できるプレイリストがありません。
                        </p>
                    ) : (
                        // プレイリストもカード型の 5 列グリッドへ揃え、チャンネル一覧と同じ操作感を提供します。
                        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                            {playlists.map((playlist) => {
                                const entry =
                                    selections[playlist.id] ??
                                    {
                                        selected: false,
                                        status: playlist.status === 1 ? "1" : playlist.status === 2 ? "2" : "2",
                                    };
                                return (
                                    <article key={playlist.id} className={styles.playlistCard}>
                                        {/* サムネイルをカード上部へ移し、視覚情報を先に確認できるよう調整します。 */}
                                        <div
                                            className={styles.thumbnailWrapper}
                                            style={{ aspectRatio: "16 / 9" }}
                                        >
                                            {renderPlaylistThumbnail(playlist)}
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
                                                                [playlist.id]: { ...entry, selected: event.target.checked },
                                                            }))
                                                        }
                                                    />
                                                    <span className="flex flex-col">
                                                        <a
                                                            href={playlist.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className={styles.cardLink}
                                                        >
                                                            {playlist.title}
                                                        </a>
                                                        <span className={styles.cardMeta}>{playlist.channel_name ?? "不明"}</span>
                                                    </span>
                                                </label>
                                            </div>
                                            {/* タイトル直下にフォームを置き、チャンネル画面と同じ操作フローに寄せます。 */}
                                            <div className="space-y-2">
                                                {/* プレイリストもラジオボタンで OK/NG を即決できるよう統一します。 */}
                                                <fieldset className={styles.radioGroup}>
                                                    <legend className="sr-only">ステータス</legend>
                                                    <div className={styles.radioOptions}>
                                                        {PLAYLIST_STATUS_OPTIONS.map((option) => {
                                                            const inputId = `playlist-status-${playlist.id}-${option.value}`;
                                                            const isChecked = entry.status === option.value;
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
                                                                        name={`playlist-status-${playlist.id}`}
                                                                        className={styles.radioInput}
                                                                        value={option.value}
                                                                        checked={isChecked}
                                                                        onChange={(event) =>
                                                                            setSelections((prev) => ({
                                                                                ...prev,
                                                                                [playlist.id]: {
                                                                                    ...entry,
                                                                                    status: event.target.value,
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
                            hasPrev,
                            hasNext,
                            onPrev: hasPrev ? () => goToPage(currentPage - 1) : undefined,
                            onNext: hasNext ? () => goToPage(currentPage + 1) : undefined,
                        }}
                        bulkControl={{
                            selectedCount,
                            totalCount: playlists.length,
                            onToggleAll: handleToggleAll,
                            onSubmit: handleSubmit,
                            submitting: loading || submitting,
                            disabled: loading || playlists.length === 0,
                        }}
                    />
                </div>
            )}
        </AdminTabsLayout>
    );
}

function useAdminBottomRightToast() {
    useEffect(() => {
        // React-Toastify の通知メソッドへ右下の配置指定を一括で差し込み、煩雑なオプション指定を防ぎます。
        const patchedMethods: Array<{ name: AdminToastMethodName; original: AdminToastInvoker }> = [];
        for (const name of ADMIN_TOAST_METHODS) {
            const original = adminToastApi[name];
            const patched: AdminToastInvoker = <TData = unknown>(
                content: ToastContent<TData>,
                options?: ToastOptions<TData>,
            ) => original(content, { ...(options ?? {}), ...ADMIN_BOTTOM_RIGHT_TOAST_OPTIONS } as ToastOptions<TData>);
            adminToastApi[name] = patched;
            patchedMethods.push({ name, original });
        }
        return () => {
            // ページ遷移などでアンマウントされた際は即座に元へ戻し、他画面の表示位置を乱さないようにします。
            for (const { name, original } of patchedMethods) {
                adminToastApi[name] = original;
            }
        };
    }, []);
}

function renderPlaylistThumbnail(playlist: AdminPlaylist) {
    if (playlist.top_video_id) {
        const thumbnailUrl = `https://i.ytimg.com/vi/${playlist.top_video_id}/mqdefault.jpg`;
        return (
            <a
                href={`https://www.youtube.com/watch?v=${playlist.top_video_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.thumbnailLink}
                aria-label={`${playlist.title} の代表動画を開く`}
            >
                <Image
                    src={thumbnailUrl}
                    alt={playlist.title}
                    fill
                    sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
                    className={styles.thumbnailImage}
                />
            </a>
        );
    }
    return (
        <a
            href={playlist.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.thumbnailFallback}
        >
            開く
        </a>
    );
}
