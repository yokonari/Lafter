"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type ChannelRow = {
  id: string;
  name: string;
  url: string;
  keyword?: string | null;
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
  category: string;
  artistName: string;
  keywordId: string;
};

const CATEGORY_OPTIONS = [
  { value: "", label: "変更しない" },
  { value: "1", label: "１：コンビ" },
  { value: "2", label: "２：トリオ" },
  { value: "3", label: "３：ピン" },
  { value: "4", label: "４：その他（劇場など）" },
];

const KEYWORD_OPTIONS = [
  { value: "", label: "変更しない" },
  { value: "1", label: "漫才 (1)" },
  { value: "2", label: "コント (2)" },
  { value: "3", label: "ネタ (3)" },
];

export function ChannelBulkManager({
  channels,
  currentPage,
  hasPrev,
  hasNext,
  prevHref,
  nextHref,
}: ChannelBulkManagerProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [selections, setSelections] = useState<Record<string, ChannelSelection>>(() => {
    const initial: Record<string, ChannelSelection> = {};
    for (const row of channels) {
      initial[row.id] = {
        selected: false,
        category: "",
        artistName: row.name,
        keywordId: "",
      };
    }
    return initial;
  });

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
        const payload: Record<string, unknown> = {
          id,
          channel_status: 1,
        };
        if (entry.category !== "") {
          payload.channel_category = Number(entry.category);
        }
        if (entry.artistName.trim() !== "") {
          payload.artist_name = entry.artistName.trim();
        }
        if (entry.keywordId.trim() !== "") {
          payload.keyword_id = Number(entry.keywordId);
        }
        return payload;
      });

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
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-950 disabled:opacity-60"
        >
          {submitting ? "送信中…" : "選択したチャンネルを更新"}
        </button>
      </div>

      {message ? (
        <p className="rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {message}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">選択</span>
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-slate-700">
                チャンネル名
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-slate-700">
                カテゴリ更新
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-slate-700">
                芸人名更新
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-slate-700">
                キーワード更新
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-slate-700">
                YouTube
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {channels.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  表示できるチャンネルがありません。
                </td>
              </tr>
            ) : (
              channels.map((channel) => {
                const entry = selections[channel.id] ?? {
                  selected: false,
                  category: "",
                  artistName: channel.name,
                  keywordId: "",
                };
                return (
                  <tr key={channel.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{channel.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <label className="sr-only" htmlFor={`category-${channel.id}`}>
                        カテゴリ更新
                      </label>
                      <select
                        id={`category-${channel.id}`}
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-100"
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
                    </td>
                    <td className="px-4 py-3">
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
                    </td>
                    <td className="px-4 py-3">
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
