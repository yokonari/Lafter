"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminTabsLayout } from "../components/AdminTabsLayout";

type AdminVideo = {
  id: string;
  url: string;
  title: string;
  channel_name: string;
  is_registered_channel: number;
};

type AdminVideosResponse = {
  videos: AdminVideo[];
  page: number;
  limit: number;
  hasNext: boolean;
};

type VideoSelection = {
  selected: boolean;
  videoStatus: string;
  videoCategory: string;
  channelStatus: string;
};

const VIDEO_STATUS_OPTIONS = [
  { value: "0", label: "０：待ち" },
  { value: "1", label: "１：OK" },
  { value: "2", label: "２：NG" },
];

const VIDEO_CATEGORY_OPTIONS = [
  { value: "0", label: "０：未分類" },
  { value: "1", label: "１：漫才" },
  { value: "2", label: "２：コント" },
  { value: "3", label: "３：ピン" },
  { value: "4", label: "４：その他" },
];

const CHANNEL_STATUS_OPTIONS = [
  { value: "0", label: "０：待ち" },
  { value: "2", label: "２：NG" },
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

  const createInitialSelections = useCallback((rows: AdminVideo[]) => {
    const next: Record<string, VideoSelection> = {};
    for (const row of rows) {
      const initialChannelStatus = row.is_registered_channel === 2 ? "2" : "0";
      next[row.id] = {
        selected: false,
        videoStatus: "2",
        videoCategory: "0",
        channelStatus: initialChannelStatus,
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
        setSelections(createInitialSelections(data.videos));
        setHasNextPage(Boolean(data.hasNext));
      } catch (error) {
        const fallback =
          error instanceof Error ? error.message : "動画一覧の取得に失敗しました。";
        setErrorMessage(fallback);
        setVideos([]);
        setSelections({});
        setHasNextPage(false);
      } finally {
        setLoading(false);
      }
    },
    [createInitialSelections],
  );

  useEffect(() => {
    loadVideos(page);
  }, [page, loadVideos]);

  const selectedCount = useMemo(
    () => Object.values(selections).filter((item) => item.selected).length,
    [selections],
  );

  const hasPrev = currentPage > 1;
  const hasNext = hasNextPage;

  const handleToggleAll = (checked: boolean) => {
    const next: Record<string, VideoSelection> = {};
    for (const [id, entry] of Object.entries(selections)) {
      next[id] = { ...entry, selected: checked };
    }
    setSelections(next);
  };

  const handleSubmit = async () => {
    setMessage(null);
    // 選択済みの行だけを丁寧にリクエスト形式へ整えます。
    const items = Object.entries(selections)
      .filter(([, entry]) => entry.selected)
      .map(([id, entry]) => ({
        id,
        video_status: Number(entry.videoStatus),
        video_category: Number(entry.videoCategory),
        channel_status: Number(entry.channelStatus),
      }));

    if (items.length === 0) {
      setMessage("更新対象の行を選択してください。");
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
        setMessage(errorMessage);
        return;
      }
      const successMessage =
        typeof data?.message === "string" && data.message.trim() !== ""
          ? data.message
          : `動画の更新が完了しました。（${data?.processed ?? items.length}件）`;
      setMessage(successMessage);
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
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
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-950 disabled:opacity-60"
            >
              {submitting ? "送信中…" : "更新"}
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
                      selected: false,
                      videoStatus: "2",
                      videoCategory: "0",
                      channelStatus: video.is_registered_channel === 2 ? "2" : "0",
                    };
                    return (
                      <article
                        key={video.id}
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
                                  [video.id]: {
                                    ...entry,
                                    selected: event.target.checked,
                                  },
                                }))
                              }
                            />
                            {video.title}
                          </label>
                          <a
                            href={video.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-slate-900 underline underline-offset-4 hover:text-slate-700"
                          >
                            開く
                          </a>
                        </div>
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
                          <div className="flex items-center justify-between gap-2">
                            <label
                              htmlFor={`channel-status-${video.id}`}
                              className="text-slate-600"
                            >
                              チャンネル
                            </label>
                            <select
                              id={`channel-status-${video.id}`}
                              className="w-2/3 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                              value={entry.channelStatus}
                              onChange={(event) =>
                                setSelections((prev) => ({
                                  ...prev,
                                  [video.id]: {
                                    ...entry,
                                    channelStatus: event.target.value,
                                    videoStatus:
                                      event.target.value === "2" ? "2" : entry.videoStatus,
                                  },
                                }))
                              }
                            >
                              {CHANNEL_STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
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
                      <th scope="col" className="w-1/6 px-4 py-3 font-medium text-slate-700">
                        動画タイトル
                      </th>
                      <th scope="col" className="w-1/6 px-4 py-3 font-medium text-slate-700">
                        チャンネル
                      </th>
                      <th scope="col" className="w-1/6 px-4 py-3 font-medium text-slate-700">
                        動画ステータス
                      </th>
                      <th scope="col" className="w-1/6 px-4 py-3 font-medium text-slate-700">
                        動画カテゴリ
                      </th>
                      <th scope="col" className="w-1/6 px-4 py-3 font-medium text-slate-700">
                        チャンネル設定
                      </th>
                      <th scope="col" className="w-1/6 px-4 py-3 font-medium text-slate-700">
                        YouTube
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {videos.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                          表示できる動画がありません。
                        </td>
                      </tr>
                    ) : (
                      videos.map((video) => {
                        const entry = selections[video.id] ?? {
                          selected: false,
                          videoStatus: "2",
                          videoCategory: "0",
                          channelStatus: video.is_registered_channel === 2 ? "2" : "0",
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
                            <td className="w-1/6 px-4 py-3 font-medium text-slate-900">{video.title}</td>
                            <td className="w-1/6 px-4 py-3 text-slate-600">
                              {video.channel_name || "チャンネル未登録"}
                            </td>
                            <td className="w-1/6 px-4 py-3">
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
                            <td className="w-1/6 px-4 py-3">
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
                            </td>
                            <td className="w-1/6 px-4 py-3">
                              <div className="flex flex-col gap-2">
                                <select
                                  id={`channel-status-${video.id}`}
                              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                              value={entry.channelStatus}
                              onChange={(event) =>
                                setSelections((prev) => ({
                                  ...prev,
                                  [video.id]: {
                                    ...entry,
                                    channelStatus: event.target.value,
                                    videoStatus:
                                      event.target.value === "2" ? "2" : entry.videoStatus,
                                  },
                                }))
                              }
                            >
                              {CHANNEL_STATUS_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className="w-1/6 px-4 py-3 text-slate-600">
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

          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-slate-600">ページ {currentPage}</span>
            <div className="flex gap-2">
              {hasPrev ? (
                <button
                  type="button"
                  onClick={() => goToPage(currentPage - 1)}
                  className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
                >
                  前のページ
                </button>
              ) : (
                <span className="cursor-not-allowed rounded border border-slate-200 px-3 py-2 text-sm text-slate-300">
                  前のページ
                </span>
              )}
              {hasNext ? (
                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
                >
                  次のページ
                </button>
              ) : (
                <span className="cursor-not-allowed rounded border border-slate-200 px-3 py-2 text-sm text-slate-300">
                  次のページ
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminTabsLayout>
  );
}

// YouTube の視聴URLを埋め込み用URLへ丁寧に変換します。
function toYouTubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    if (hostname === "youtu.be") {
      const videoId = parsed.pathname.slice(1);
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }
    if (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "youtube-nocookie.com"
    ) {
      if (parsed.pathname === "/watch") {
        const videoId = parsed.searchParams.get("v");
        return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
      }
      if (parsed.pathname.startsWith("/embed/")) {
        return url;
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        const videoId = parsed.pathname.split("/")[2];
        return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function renderEmbeddedVideo(video: AdminVideo) {
  const embedUrl = toYouTubeEmbedUrl(video.url);
  if (!embedUrl) {
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
    <iframe
      src={embedUrl}
      title={`video-${video.id}`}
      className="h-full w-full"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}
