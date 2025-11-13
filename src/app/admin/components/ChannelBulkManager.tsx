"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListFooter } from "./ListFooter";
import { toast } from "react-toastify";

export type ChannelRow = {
  id: string;
  name: string;
  url: string;
  status?: number | null;
  keyword?: string | null;
  latestVideoTitle?: string | null;
  latestVideoId?: string | null;
};

type ChannelBulkManagerProps = {
  channels: ChannelRow[];
  currentPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevHref: string;
  nextHref: string;
  registeredView?: boolean;
};

type ChannelSelection = {
  selected: boolean;
  status: string;
  keywordId: string;
};

const STATUS_OPTIONS = [
  { value: "", label: "変更しない" },
  { value: "0", label: "待ち" },
  { value: "1", label: "✅ OK" },
  { value: "2", label: "⛔ NG" },
];

const KEYWORD_OPTIONS = [
  { value: "", label: "変更しない" },
  { value: "1", label: "🎙️ 漫才" },
  { value: "2", label: "🎬 コント" },
  { value: "3", label: "🎯 ネタ" },
];

// DB に保存されているキーワード文字列をセレクトボックスの値へ丁寧に正規化します。
const KEYWORD_LABEL_TO_ID: Record<string, string> = {
  漫才: "1",
  コント: "2",
  ネタ: "3",
};

export function ChannelBulkManager({
  channels,
  currentPage,
  hasPrev,
  hasNext,
  prevHref,
  nextHref,
  registeredView = false,
}: ChannelBulkManagerProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const [selections, setSelections] = useState<Record<string, ChannelSelection>>(() =>
    buildInitialSelections(channels, registeredView),
  );

  useEffect(() => {
    // サーバー側で再取得されたチャンネル一覧が流れてきた際に、登録済みフィルターの状態へ丁寧に合わせます。
    setSelections(buildInitialSelections(channels, registeredView));
  }, [channels, registeredView]);

  const selectedCount = useMemo(
    () => Object.values(selections).filter((item) => item.selected).length,
    [selections],
  );

  const handleToggleAll = (checked: boolean) => {
    const next: Record<string, ChannelSelection> = {};
    for (const [id, entry] of Object.entries(selections)) {
      next[id] = { ...entry, selected: checked };
    }
    setSelections(next);
  };

  const handleSubmit = async () => {
    const items = Object.entries(selections)
      .filter(([, entry]) => entry.selected)
      .map(([id, entry]) => {
        const payload: Record<string, unknown> = { id };
        const isOfficial = entry.status === "1";

        // ステータスが OK (1) の場合のみ、追加情報を丁寧に送信いたします。
        if (entry.status !== "") {
          payload.channel_status = Number(entry.status);
        }
        if (isOfficial && entry.keywordId.trim() !== "") {
          payload.keyword_id = Number(entry.keywordId);
        }
        return payload;
      })
      .filter((payload) => Object.keys(payload).length > 1);

    if (items.length === 0) {
      toast.error("更新対象の行を選択してください。");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/channel/bulk", {
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
            : "チャンネルの更新に失敗しました。";
        toast.error(errorMessage);
        return;
      }
      const successMessage =
        typeof data?.message === "string" && data.message.trim() !== ""
          ? data.message
          : `チャンネルの更新が完了しました。（${data?.processed ?? items.length}件）`;
      toast.success(successMessage);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      // 更新完了後も登録済みフィルターがあれば未選択に戻すため、初期状態を再構築します。
      setSelections(buildInitialSelections(channels, registeredView));
      // 更新完了後に最新のチャンネル一覧へ差し替えるため、Next.js のルーターへ再描画を依頼いたします。
      router.refresh();
    } catch (error) {
      const fallback =
        error instanceof Error ? error.message : "チャンネル更新中に予期せぬエラーが発生しました。";
      toast.error(fallback);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {channels.length === 0 ? (
        <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
          表示できるチャンネルがありません。
        </p>
      ) : (
        // 大画面では 5 列のグリッドに丁寧に並べ替え、一覧確認と更新操作を同時に行いやすくします。
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {channels.map((channel) => {
            const entry = selections[channel.id] ?? createSelectionEntry(channel, registeredView);
            return (
              <article
                key={channel.id}
                className="flex h-full flex-col rounded bg-white p-0"
              >
                {/* サムネイルを先頭に配置し、チャンネルの雰囲気をひと目で把握できるようにします。 */}
                <div
                  className="w-full overflow-hidden rounded border border-slate-200 shadow-sm"
                  style={{ aspectRatio: "16 / 9" }}
                >
                  {renderLatestVideoEmbed(channel)}
                </div>
                <div className="mt-3 flex flex-1 flex-col justify-between space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <label className="inline-flex flex-1 items-start gap-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                        checked={entry.selected}
                        onChange={(event) =>
                          setSelections((prev) => ({
                            ...prev,
                            [channel.id]: {
                              ...(prev[channel.id] ?? entry),
                              selected: event.target.checked,
                            },
                          }))
                        }
                      />
                      <span className="flex flex-col">
                        <a
                          href={channel.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-900 underline-offset-2 hover:underline"
                        >
                          {channel.name}
                        </a>
                        {channel.latestVideoTitle ? (
                          <span className="text-xs text-slate-500">{channel.latestVideoTitle}</span>
                        ) : null}
                      </span>
                    </label>
                  </div>
                  {/* ラベルとフォームをサムネイル直下のコンテナへまとめ、操作フローを視線移動なく進めます。 */}
                  <div className="flex items-center gap-2 text-sm">
                    <div className={entry.status === "1" ? "w-1/2" : "w-full"}>
                      <label
                        htmlFor={`status-${channel.id}`}
                        className="sr-only"
                      >
                        ステータス
                      </label>
                      <select
                        id={`status-${channel.id}`}
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                        value={entry.status}
                        onChange={(event) =>
                          setSelections((prev) => ({
                            ...prev,
                            [channel.id]: {
                              ...entry,
                              status: event.target.value,
                              keywordId: event.target.value === "1" ? entry.keywordId : "",
                            },
                          }))
                        }
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {entry.status === "1" ? (
                      <div className="w-1/2">
                        <label
                          htmlFor={`keyword-${channel.id}`}
                          className="sr-only"
                        >
                          キーワード
                        </label>
                        <select
                          id={`keyword-${channel.id}`}
                          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                          value={entry.keywordId}
                          onChange={(event) =>
                            setSelections((prev) => ({
                              ...prev,
                              [channel.id]: {
                                ...entry,
                                keywordId: event.target.value,
                              },
                            }))
                          }
                        >
                          {KEYWORD_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
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
            hasPrev,
            hasNext,
            prevHref,
            nextHref,
          }}
          headerContent={
            <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                    checked={selectedCount > 0 && selectedCount === channels.length}
                    onChange={(event) => handleToggleAll(event.target.checked)}
                    aria-label="全て選択"
                  />
                  全て選択
                </label>
                <span className="text-sm text-slate-500">
                  選択中: {selectedCount} / {channels.length}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-full bg-[#f2a51e] px-6 py-2 text-sm font-medium text-white transition-colors hover:brightness-110 disabled:opacity-60"
              >
                {submitting ? "送信中…" : "更新"}
              </button>
            </div>
          }
        />
      </div>

      <div className="hidden lg:block">
        {/* 大画面では更新ボタンとページングを同列にまとめ、一覧操作の文脈を崩さずに表示します。 */}
        <div className="rounded-2xl bg-white px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  checked={selectedCount > 0 && selectedCount === channels.length}
                  onChange={(event) => handleToggleAll(event.target.checked)}
                  aria-label="全て選択"
                />
                全て選択
              </label>
              <span className="text-sm text-slate-500">
                選択中: {selectedCount} / {channels.length}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-4">
              {/* ページ情報も同列に表示し、前後遷移を即座に実行できます。 */}
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <span>ページ {currentPage}</span>
                <div className="flex gap-3">
                  {hasPrev ? (
                    <Link
                      href={prevHref}
                      prefetch={false}
                      className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 text-slate-700 transition-colors hover:bg-slate-100"
                      aria-label="前のページ"
                    >
                      <span className="material-symbols-rounded" aria-hidden="true">
                        arrow_back
                      </span>
                    </Link>
                  ) : (
                    <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-300">
                      <span className="material-symbols-rounded" aria-hidden="true">
                        arrow_back
                      </span>
                      <span className="sr-only">前のページ</span>
                    </span>
                  )}
                  {hasNext ? (
                    <Link
                      href={nextHref}
                      prefetch={false}
                      className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 text-slate-700 transition-colors hover:bg-slate-100"
                      aria-label="次のページ"
                    >
                      <span className="material-symbols-rounded" aria-hidden="true">
                        arrow_forward
                      </span>
                    </Link>
                  ) : (
                    <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-300">
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
                disabled={submitting}
                className="rounded-full bg-[#f2a51e] px-6 py-2 text-sm font-medium text-white transition-colors hover:brightness-110 disabled:opacity-60"
              >
                {submitting ? "送信中…" : "更新"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderLatestVideoEmbed(channel: ChannelRow) {
  if (channel.latestVideoId) {
    const thumbnailUrl = `https://i.ytimg.com/vi/${channel.latestVideoId}/mqdefault.jpg`;
    // 動画の埋め込みではなく軽量なサムネイルを表示し、クリックで YouTube へ遷移できるようにします。
    return (
      <a
        href={`https://www.youtube.com/watch?v=${channel.latestVideoId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-full w-full"
        aria-label={`${channel.name} の最新動画を開く`}
      >
        <img
          src={thumbnailUrl}
          alt={channel.latestVideoTitle ?? `${channel.name} の最新動画`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </a>
    );
  }
  if (channel.latestVideoTitle) {
    return (
      <div className="flex h-full items-center justify-center px-3 text-center text-xs text-slate-500">
        {channel.latestVideoTitle}
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center px-3 text-xs text-slate-400">
      最新動画情報がありません
    </div>
  );
}

function buildInitialSelections(channels: ChannelRow[], registeredView: boolean) {
  const initial: Record<string, ChannelSelection> = {};
  for (const row of channels) {
    initial[row.id] = createSelectionEntry(row, registeredView);
  }
  return initial;
}

function resolveKeywordId(keyword?: string | null): string {
  if (!keyword) {
    return "";
  }
  return KEYWORD_LABEL_TO_ID[keyword] ?? "";
}

function createSelectionEntry(channel: ChannelRow, registeredView: boolean): ChannelSelection {
  if (registeredView) {
    // 登録済み一覧では既存データを丁寧に初期値へ反映し、無用な再入力を避けます。
    const status = channel.status === null || channel.status === undefined ? "" : String(channel.status);
    const keywordId = resolveKeywordId(channel.keyword);
    return {
      selected: true,
      status,
      keywordId,
    };
  }

  return {
    selected: true,
    status: "2",
    keywordId: "1",
  };
}
