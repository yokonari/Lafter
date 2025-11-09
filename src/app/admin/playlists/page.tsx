"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminTabsLayout } from "../components/AdminTabsLayout";
import { ListFooter } from "../components/ListFooter";

type AdminPlaylist = {
  id: string;
  url: string;
  title: string;
  status: number;
  channel_name?: string;
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

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<AdminPlaylist[]>([]);
  const [currentPage, setCurrentPage] = useState(page);
  const [selections, setSelections] = useState<Record<string, PlaylistSelection>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const createInitialSelections = useCallback((rows: AdminPlaylist[]) => {
    const next: Record<string, PlaylistSelection> = {};
    for (const row of rows) {
      const initialStatus = row.status === 1 ? "1" : row.status === 2 ? "2" : "2";
      next[row.id] = { selected: true, status: initialStatus };
    }
    return next;
  }, []);

  const loadPlaylists = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setErrorMessage(null);
      setMessage(null);
      setHasNext(false);
      try {
        const query = targetPage > 1 ? `?page=${targetPage}` : "";
        const response = await fetch(`/api/admin/play_lists${query}`, {
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
      } finally {
        setLoading(false);
      }
    },
    [createInitialSelections],
  );

  useEffect(() => {
    loadPlaylists(page);
  }, [page, loadPlaylists]);

  const selectedCount = useMemo(
    () => Object.values(selections).filter((item) => item.selected).length,
    [selections],
  );

  const hasPrev = currentPage > 1;

  const handleToggleAll = (checked: boolean) => {
    const next: Record<string, PlaylistSelection> = {};
    for (const playlist of playlists) {
      const entry =
        selections[playlist.id] ??
        { selected: true, status: playlist.status === 1 ? "1" : playlist.status === 2 ? "2" : "2" };
      next[playlist.id] = { ...entry, selected: checked };
    }
    setSelections(next);
  };

  const goToPage = (targetPage: number) => {
    if (targetPage === currentPage) return;
    const query = targetPage > 1 ? `?page=${targetPage}` : "";
    router.push(`/admin/playlists${query}`);
  };

  const handleSubmit = async () => {
    setMessage(null);
    const items = Object.entries(selections)
      .filter(([, entry]) => entry.selected)
      .map(([id, entry]) => ({
        id,
        status: Number(entry.status),
      }));

    if (items.length === 0) {
      setMessage("更新対象の行を選択してください。");
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
        setMessage(errorMessage);
        return;
      }
      const successMessage =
        typeof data?.message === "string" && data.message.trim() !== ""
          ? data.message
          : `プレイリストの更新が完了しました。（${data?.processed ?? items.length}件）`;
      setMessage(successMessage);
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
      await loadPlaylists(currentPage);
    } catch (error) {
      const fallback =
        error instanceof Error ? error.message : "プレイリスト更新中に予期せぬエラーが発生しました。";
      setMessage(fallback);
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
                {playlists.length === 0 ? (
                  <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                    表示できるプレイリストがありません。
                  </p>
                ) : (
                  playlists.map((playlist) => {
                    const entry =
                      selections[playlist.id] ??
                      { selected: false, status: playlist.status === 1 ? "1" : playlist.status === 2 ? "2" : "2" };
                    return (
                      <article
                        key={playlist.id}
                        className="rounded border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                              checked={entry.selected}
                              onChange={(event) =>
                                setSelections((prev) => ({
                                  ...prev,
                                  [playlist.id]: { ...entry, selected: event.target.checked },
                                }))
                              }
                            />
                            {playlist.title}
                          </label>
                          <a
                            href={playlist.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-slate-900 underline underline-offset-4 hover:text-slate-700"
                          >
                            開く
                          </a>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                          <span className="text-slate-600">ステータス</span>
                          <select
                            className="w-28 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
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
                        <div
                          className="mt-3 w-full overflow-hidden rounded border border-slate-200 shadow-sm"
                          style={{ aspectRatio: "16 / 9" }}
                        >
                          {renderEmbeddedPlaylist(playlist)}
                        </div>
                        <div className="mt-3 text-sm text-slate-600">
                          チャンネル:{" "}
                          <span className="font-medium text-slate-900">
                            {playlist.channel_name ?? "不明"}
                          </span>
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
                      <th scope="col" className="px-4 py-3 font-medium text-slate-700">
                        プレイリスト名
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-slate-700">
                        チャンネル名
                      </th>
                      <th scope="col" className="w-32 px-4 py-3 font-medium text-slate-700">ステータス</th>
                      <th scope="col" className="w-64 px-4 py-3 font-medium text-slate-700">プレビュー</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {playlists.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                          表示できるプレイリストがありません。
                        </td>
                      </tr>
                    ) : (
                      playlists.map((playlist) => {
                        const entry =
                          selections[playlist.id] ??
                          { selected: false, status: playlist.status === 1 ? "1" : playlist.status === 2 ? "2" : "2" };
                        return (
                          <tr key={playlist.id} className="hover:bg-slate-50">
                            <td className="w-8 px-4 py-3">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                                checked={entry.selected}
                                onChange={(event) =>
                                  setSelections((prev) => ({
                                    ...prev,
                                    [playlist.id]: { ...entry, selected: event.target.checked },
                                  }))
                                }
                                aria-label={`${playlist.title} を選択`}
                              />
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-900">{playlist.title}</td>
                            <td className="px-4 py-3 text-slate-700">{playlist.channel_name ?? "不明"}</td>
                            <td className="w-32 px-4 py-3">
                              <select
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
                            </td>
                            <td className="w-64 px-4 py-3 text-slate-600">
                              <div
                                className="overflow-hidden rounded border border-slate-200 shadow-sm"
                                style={{ aspectRatio: "16 / 9" }}
                              >
                                {renderEmbeddedPlaylist(playlist)}
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

// プレイリストURLを埋め込み用URLへ丁寧に変換します。
function toPlaylistEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.pathname === "/playlist") {
      const listId = parsed.searchParams.get("list");
      return listId ? `https://www.youtube.com/embed/videoseries?list=${listId}` : null;
    }
    if (parsed.pathname.includes("/playlist/") || parsed.pathname.includes("/playlists/")) {
      const listId = parsed.searchParams.get("list");
      return listId ? `https://www.youtube.com/embed/videoseries?list=${listId}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

function renderEmbeddedPlaylist(playlist: AdminPlaylist) {
  const embedUrl = toPlaylistEmbedUrl(playlist.url);
  if (!embedUrl) {
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
  return (
    <iframe
      src={embedUrl}
      title={`playlist-${playlist.id}`}
      className="h-full w-full"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}
