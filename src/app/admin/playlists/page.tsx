"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminTabsLayout } from "../components/AdminTabsLayout";
import { ListFooter } from "../components/ListFooter";
import { toast } from "react-toastify";
import styles from "../adminTheme.module.scss";

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
          <p className={styles.feedbackCard}>
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
        <p className={styles.errorMessage}>
          {errorMessage}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
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
                          return (
                            <label
                              key={option.value}
                              htmlFor={inputId}
                              className={`${styles.radioOption} ${isChecked ? styles.radioOptionActive : ""}`}
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
          <div className="lg:hidden">
            <ListFooter
              paging={{
                currentPage,
                hasPrev,
                hasNext,
                onPrev: hasPrev ? () => goToPage(currentPage - 1) : undefined,
                onNext: hasNext ? () => goToPage(currentPage + 1) : undefined,
              }}
              headerContent={
                <div className={`flex flex-1 flex-wrap items-center justify-between gap-3 ${styles.headerText}`}>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        className={styles.checkboxControl}
                        checked={selectedCount > 0 && selectedCount === Object.keys(selections).length}
                        onChange={(event) => handleToggleAll(event.target.checked)}
                        aria-label="全て選択"
                        disabled={loading || playlists.length === 0}
                      />
                      全て選択
                    </label>
                    <span className={styles.metaText}>
                      選択中: {selectedCount} / {playlists.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading || submitting || playlists.length === 0}
                    className={styles.primaryButton}
                  >
                    {submitting ? "送信中…" : "更新"}
                  </button>
                </div>
              }
            />
          </div>

          <div className="hidden lg:block">
            {/* 大画面ではチャンネル・動画一覧と同様に、更新ボタンとページングを横並びで見せます。 */}
            <div className={styles.desktopFooterCard}>
              <div className="flex flex-wrap items-center justify-between gap-6">
                <div className={`flex flex-wrap items-center gap-3 text-sm ${styles.headerText}`}>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className={styles.checkboxControl}
                      checked={selectedCount > 0 && selectedCount === Object.keys(selections).length}
                      onChange={(event) => handleToggleAll(event.target.checked)}
                      aria-label="全て選択"
                      disabled={loading || playlists.length === 0}
                    />
                    全て選択
                  </label>
                  <span className={styles.metaText}>選択中: {selectedCount} / {playlists.length}</span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-4">
                  {/* ページ情報と前後ボタンを併記し、操作のリズムを他画面と揃えます。 */}
                  <div className={styles.pagerSection}>
                    <span>ページ {currentPage}</span>
                    <div className={styles.pagerControls}>
                      {hasPrev ? (
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
                      {hasNext ? (
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
                    disabled={loading || submitting || playlists.length === 0}
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
