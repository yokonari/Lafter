"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminTabsLayout } from "../components/AdminTabsLayout";
import { ListFooter } from "../components/ListFooter";
import { toast } from "react-toastify";

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
  { value: "1", label: "✅ OK" },
  { value: "2", label: "⛔ NG" },
];

const defaultPlaylistStatus = 0;

export default function AdminPlaylistsPage() {
  return (
    <Suspense
      fallback={
        <AdminTabsLayout activeTab="playlists">
          <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
            画面を読み込んでいます…
          </p>
        </AdminTabsLayout>
      }
    >
      <AdminPlaylistsPageContent />
    </Suspense>
  );
}

function AdminPlaylistsPageContent() {
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
    const items = Object.entries(selections)
      .filter(([, entry]) => entry.selected)
      .map(([id, entry]) => ({
        id,
        status: Number(entry.status),
      }));

    if (items.length === 0) {
      toast.error("更新対象の行を選択してください。");
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

  return (
    <AdminTabsLayout activeTab="playlists">
      {errorMessage ? (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePendingFilterClick}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                isPendingFilter
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              未判定
            </button>
            <button
              type="button"
              onClick={handleOkFilterClick}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                isOkFilter
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              OK
            </button>
            <button
              type="button"
              onClick={handleNgFilterClick}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                isNgFilter
                  ? "border-red-600 bg-red-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              NG
            </button>
          </div>
          {loading ? (
            <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
              読み込み中です…
            </p>
          ) : playlists.length === 0 ? (
            <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
              表示できるプレイリストがありません。
            </p>
          ) : (
            // プレイリストもカード型の 5 列グリッドへ揃え、チャンネル一覧と同じ操作感を提供します。
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {playlists.map((playlist) => {
                const entry =
                  selections[playlist.id] ??
                  {
                    selected: false,
                    status: playlist.status === 1 ? "1" : playlist.status === 2 ? "2" : "2",
                  };
                return (
                  <article
                    key={playlist.id}
                    className="flex h-full flex-col rounded border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <label className="inline-flex flex-1 items-start gap-2 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                          checked={entry.selected}
                          onChange={(event) =>
                            setSelections((prev) => ({
                              ...prev,
                              [playlist.id]: { ...entry, selected: event.target.checked },
                            }))
                          }
                        />
                        <span className="flex flex-col">
                          <span>{playlist.title}</span>
                          <span className="text-xs text-slate-500">{playlist.channel_name ?? "不明"}</span>
                        </span>
                      </label>
                      <a
                        href={playlist.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="material-symbols-rounded rounded-full bg-slate-100 p-2 text-slate-700 transition-colors hover:bg-slate-200"
                        aria-label={`${playlist.title} を開く`}
                      >
                        open_in_new
                      </a>
                    </div>
                    <div className="mt-3 flex flex-1 flex-col justify-end space-y-3 text-sm">
                      <div
                        className="w-full overflow-hidden rounded border border-slate-200 shadow-sm"
                        style={{ aspectRatio: "16 / 9" }}
                      >
                        {renderPlaylistThumbnail(playlist)}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <label htmlFor={`playlist-status-${playlist.id}`} className="sr-only">
                          ステータス
                        </label>
                        <select
                          id={`playlist-status-${playlist.id}`}
                          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                          value={entry.status}
                          onChange={(event) =>
                            setSelections((prev) => ({
                              ...prev,
                              [playlist.id]: {
                                ...entry,
                                status: event.target.value,
                              },
                            }))
                          }
                        >
                          {PLAYLIST_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
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
                      disabled={loading || playlists.length === 0}
                    />
                    全て選択
                  </label>
                  <span className="text-sm text-slate-500">
                    選択中: {selectedCount} / {playlists.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || submitting || playlists.length === 0}
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

function renderPlaylistThumbnail(playlist: AdminPlaylist) {
  if (playlist.status === 1 && playlist.top_video_id) {
    const thumbnailUrl = `https://i.ytimg.com/vi/${playlist.top_video_id}/mqdefault.jpg`;
    return (
      <a
        href={`https://www.youtube.com/watch?v=${playlist.top_video_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-full w-full"
        aria-label={`${playlist.title} の代表動画を開く`}
      >
        <img
          src={thumbnailUrl}
          alt={playlist.title}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </a>
    );
  }
  return (
    <a
      href={playlist.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-full items-center justify-center text-slate-900 underline underline-offset-4 hover:text-slate-700"
    >
      開く
    </a>
  );
}
