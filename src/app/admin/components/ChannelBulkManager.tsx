"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type ChannelRow = {
  id: string;
  name: string;
  url: string;
  status?: number | null;
  keyword?: string | null;
  latestVideoTitle?: string | null;
};

type ChannelBulkManagerProps = {
  channels: ChannelRow[];
  currentPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevHref: string;
  nextHref: string;
};

type ChannelSelection = {
  selected: boolean;
  status: string;
  category: string;
  artistName: string;
  keywordId: string;
};

const STATUS_OPTIONS = [
  { value: "", label: "変更しない" },
  { value: "0", label: "待ち" },
  { value: "1", label: "✅ OK" },
  { value: "2", label: "⛔ NG" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "変更しない" },
  { value: "1", label: "🧑‍🤝‍🧑 コンビ" },
  { value: "2", label: "👪 トリオ" },
  { value: "3", label: "🧍‍♂️ ピン" },
  { value: "4", label: "🏢 その他（劇場など）" },
];

const KEYWORD_OPTIONS = [
  { value: "", label: "変更しない" },
  { value: "1", label: "🎙️ 漫才" },
  { value: "2", label: "🎬 コント" },
  { value: "3", label: "🎯 ネタ" },
];

export function ChannelBulkManager({
  channels,
  currentPage,
  hasPrev,
  hasNext,
  prevHref,
  nextHref,
}: ChannelBulkManagerProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [selections, setSelections] = useState<Record<string, ChannelSelection>>(() => {
    const initial: Record<string, ChannelSelection> = {};
    for (const row of channels) {
      initial[row.id] = {
        selected: false,
        status: "2",
        category: "1",
        artistName: row.name,
        keywordId: "1",
      };
    }
    return initial;
  });

  useEffect(() => {
    // サーバー側で再取得されたチャンネル一覧が流れてきた際に、選択状態を丁寧に初期化し直します。
    setSelections((prev) => {
      const nextSelections: Record<string, ChannelSelection> = {};
      for (const row of channels) {
        const existing = prev[row.id];
        nextSelections[row.id] = existing
          ? existing
          : {
              selected: false,
              status: "2",
              category: "1",
              artistName: row.name,
              keywordId: "1",
            };
      }
      return nextSelections;
    });
  }, [channels]);

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
    setMessage(null);
    const items = Object.entries(selections)
      .filter(([, entry]) => entry.selected)
      .map(([id, entry]) => {
        const payload: Record<string, unknown> = { id };
        const isOfficial = entry.status === "1";

        // ステータスが OK (1) の場合のみ、追加情報を丁寧に送信いたします。
        if (entry.status !== "") {
          payload.channel_status = Number(entry.status);
        }
        if (isOfficial && entry.category !== "") {
          payload.channel_category = Number(entry.category);
        }
        if (isOfficial && entry.artistName.trim() !== "") {
          payload.artist_name = entry.artistName.trim();
        }
        if (isOfficial && entry.keywordId.trim() !== "") {
          payload.keyword_id = Number(entry.keywordId);
        }
        return payload;
      })
      .filter((payload) => Object.keys(payload).length > 1);

    if (items.length === 0) {
      setMessage("更新対象の行を選択してください。");
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
        setMessage(errorMessage);
        return;
      }
      const successMessage =
        typeof data?.message === "string" && data.message.trim() !== ""
          ? data.message
          : `チャンネルの更新が完了しました。（${data?.processed ?? items.length}件）`;
      setMessage(successMessage);
      // 更新完了後に最新のチャンネル一覧へ差し替えるため、Next.js のルーターへ再描画を依頼いたします。
      router.refresh();
    } catch (error) {
      const fallback =
        error instanceof Error ? error.message : "チャンネル更新中に予期せぬエラーが発生しました。";
      setMessage(fallback);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
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
      </div>

      {message ? (
        <p className="rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {message}
        </p>
      ) : null}

      <div className="grid gap-3 sm:hidden">
        {channels.length === 0 ? (
          <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
            表示できるチャンネルがありません。
          </p>
        ) : (
          channels.map((channel) => {
            const entry = selections[channel.id] ?? {
              selected: false,
              status: channel.status !== undefined && channel.status !== null ? String(channel.status) : "2",
              category: "1",
              artistName: channel.name,
              keywordId: "1",
            };
            return (
              <article
                key={channel.id}
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
                  [channel.id]: {
                    ...entry,
                    selected: event.target.checked,
                  },
                }))
              }
            />
            <span className="flex flex-col">
              <span>{channel.name}</span>
              {channel.latestVideoTitle ? (
                <span className="text-xs text-slate-500">{channel.latestVideoTitle}</span>
              ) : null}
            </span>
          </label>
          <a
            href={channel.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-slate-900 underline underline-offset-4 hover:text-slate-700"
                  >
                    開く
                  </a>
                </div>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor={`status-${channel.id}`} className="text-slate-600">
                      ステータス
                    </label>
                <select
                  id={`status-${channel.id}`}
                  className="w-2/3 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  value={entry.status}
                  onChange={(event) =>
                    setSelections((prev) => ({
                      ...prev,
                      [channel.id]: {
                            ...entry,
                            status: event.target.value,
                            category: event.target.value === "1" ? entry.category : "",
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
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor={`category-${channel.id}`} className="text-slate-600">
                          カテゴリ
                        </label>
                        <select
                          id={`category-${channel.id}`}
                          className="w-2/3 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                          value={entry.category}
                          onChange={(event) =>
                            setSelections((prev) => ({
                              ...prev,
                              [channel.id]: {
                                ...entry,
                                category: event.target.value,
                              },
                            }))
                          }
                        >
                          {CATEGORY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor={`artist-${channel.id}`} className="text-slate-600">
                          芸人名
                        </label>
                        <input
                          id={`artist-${channel.id}`}
                          type="text"
                          value={entry.artistName}
                          onChange={(event) =>
                            setSelections((prev) => ({
                              ...prev,
                              [channel.id]: {
                                ...entry,
                                artistName: event.target.value,
                              },
                            }))
                          }
                          className="w-2/3 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                          placeholder="変更しない場合は空欄"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor={`keyword-${channel.id}`} className="text-slate-600">
                          キーワード
                        </label>
                        <select
                          id={`keyword-${channel.id}`}
                          className="w-2/3 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
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
                    </>
                  ) : null}
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
                チャンネル名
              </th>
              <th scope="col" className="w-1/6 px-4 py-3 font-medium text-slate-700">
                ステータス更新
              </th>
              <th scope="col" className="w-1/6 px-4 py-3 font-medium text-slate-700">
                カテゴリ更新
              </th>
              <th scope="col" className="w-1/6 px-4 py-3 font-medium text-slate-700">
                芸人名更新
              </th>
              <th scope="col" className="w-1/6 px-4 py-3 font-medium text-slate-700">
                キーワード更新
              </th>
              <th scope="col" className="w-1/6 px-4 py-3 font-medium text-slate-700">
                YouTube
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {channels.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  表示できるチャンネルがありません。
                </td>
              </tr>
            ) : (
              channels.map((channel) => {
                const entry = selections[channel.id] ?? {
                  selected: false,
                  status: channel.status !== undefined && channel.status !== null ? String(channel.status) : "2",
                  category: "1",
                  artistName: channel.name,
                  keywordId: "1",
                };
                return (
                  <tr key={channel.id} className="hover:bg-slate-50">
                    <td className="w-8 px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                        checked={entry.selected}
                        onChange={(event) =>
                          setSelections((prev) => ({
                            ...prev,
                            [channel.id]: {
                              ...entry,
                              selected: event.target.checked,
                            },
                          }))
                        }
                        aria-label={`${channel.name} を選択`}
                      />
                    </td>
                    <td className="w-1/6 px-4 py-3">
                      <div className="font-medium text-slate-900">{channel.name}</div>
                      {channel.latestVideoTitle ? (
                        <div className="mt-1 text-xs text-slate-500">{channel.latestVideoTitle}</div>
                      ) : null}
                    </td>
                    <td className="w-1/6 px-4 py-3">
                      <label className="sr-only" htmlFor={`status-${channel.id}`}>
                        ステータス更新
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
                              category: event.target.value === "1" ? entry.category : "",
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
                    </td>
                    <td className="w-1/6 px-4 py-3">
                      {entry.status === "1" ? (
                        <>
                          <label className="sr-only" htmlFor={`category-${channel.id}`}>
                            カテゴリ更新
                          </label>
                          <select
                            id={`category-${channel.id}`}
                            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                            value={entry.category}
                            onChange={(event) =>
                              setSelections((prev) => ({
                                ...prev,
                                [channel.id]: {
                                  ...entry,
                                  category: event.target.value,
                                },
                              }))
                            }
                          >
                            {CATEGORY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : null}
                    </td>
                    <td className="w-1/6 px-4 py-3">
                      {entry.status === "1" ? (
                        <>
                          <label className="sr-only" htmlFor={`artist-${channel.id}`}>
                            芸人名更新
                          </label>
                          <input
                            id={`artist-${channel.id}`}
                            type="text"
                            value={entry.artistName}
                            onChange={(event) =>
                              setSelections((prev) => ({
                                ...prev,
                                [channel.id]: {
                                  ...entry,
                                  artistName: event.target.value,
                                },
                              }))
                            }
                            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                            placeholder="変更しない場合は空欄"
                          />
                        </>
                      ) : null}
                    </td>
                    <td className="w-1/6 px-4 py-3">
                      {entry.status === "1" ? (
                        <>
                          <label className="sr-only" htmlFor={`keyword-${channel.id}`}>
                            キーワード更新
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
                        </>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <a
                        href={channel.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-900 underline underline-offset-4 hover:text-slate-700"
                      >
                        開く
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        {/* 一覧を確認した直後に送信できるよう、テーブル直下へ更新ボタンを丁寧に配置します。 */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-950 disabled:opacity-60"
        >
          {submitting ? "送信中…" : "更新"}
        </button>
      </div>

      <div className="flex items-center justify-between pt-2">
        <span className="text-sm text-slate-600">ページ {currentPage}</span>
        <div className="flex gap-2">
          {hasPrev ? (
            <Link
              href={prevHref}
              prefetch={false}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
            >
              前のページ
            </Link>
          ) : (
            <span className="cursor-not-allowed rounded border border-slate-200 px-3 py-2 text-sm text-slate-300">
              前のページ
            </span>
          )}
          {hasNext ? (
            <Link
              href={nextHref}
              prefetch={false}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
            >
              次のページ
            </Link>
          ) : (
            <span className="cursor-not-allowed rounded border border-slate-200 px-3 py-2 text-sm text-slate-300">
              次のページ
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
