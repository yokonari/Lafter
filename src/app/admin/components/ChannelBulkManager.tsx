"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ListFooter } from "./ListFooter";
import { toast } from "react-toastify";
import styles from "../adminTheme.module.scss";

export type ChannelRow = {
  id: string;
  name: string;
  url: string;
  status?: number | null;
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
};

const STATUS_OPTIONS = [
  { value: "1", label: "OK" as const },
  { value: "2", label: "NG" as const },
];

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
    const channelMap = new Map(channels.map((c) => [c.id, c]));

    const items = Object.entries(selections)
      .filter(([, entry]) => entry.selected)
      .map(([id, entry]) => {
        const original = channelMap.get(id);
        const currentStatusStr = entry.status.trim();
        const originalStatusStr =
          original?.status !== null && original?.status !== undefined
            ? String(original.status)
            : "";

        if (currentStatusStr === originalStatusStr) {
          return null;
        }

        const payload: Record<string, unknown> = { id };
        if (currentStatusStr !== "") {
          payload.channel_status = Number(currentStatusStr);
        }
        return payload;
      })
      .filter((payload) => payload !== null && Object.keys(payload).length > 1);

    if (items.length === 0) {
      const hasSelections = Object.values(selections).some((s) => s.selected);
      if (hasSelections) {
        toast.info("変更が必要な項目はありません。");
      } else {
        toast.error("更新対象の行を選択してください。");
      }
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
        <p className={styles.feedbackCard}>
          表示できるチャンネルがありません。
        </p>
      ) : (
        // 大画面では 5 列のグリッドに丁寧に並べ替え、一覧確認と更新操作を同時に行いやすくします。
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {channels.map((channel) => {
            const entry = selections[channel.id] ?? createSelectionEntry(channel, registeredView);
            return (
              <article key={channel.id} className={styles.card}>
                {/* サムネイルを先頭に配置し、チャンネルの雰囲気をひと目で把握できるようにします。 */}
                <div
                  className={styles.thumbnailWrapper}
                  style={{ aspectRatio: "16 / 9" }}
                >
                  {renderLatestVideoEmbed(channel)}
                </div>
                <div className={styles.cardBody}>
                  <div className="flex items-start justify-between gap-3">
                    <label
                      className={`inline-flex flex-1 items-start gap-2 text-sm font-medium ${styles.cardLabel}`}
                    >
                      <input
                        type="checkbox"
                        className={`${styles.checkbox} mt-1`}
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
                          className={styles.cardLink}
                        >
                          {channel.name}
                        </a>
                        {channel.latestVideoTitle ? (
                          <span className={styles.cardMeta}>{channel.latestVideoTitle}</span>
                        ) : null}
                      </span>
                    </label>
                  </div>
                  {/* ラベルとフォームをサムネイル直下のコンテナへまとめ、操作フローを視線移動なく進めます。 */}
                  <div className={styles.controlRow}>
                    {/* ステータス切り替えもラジオボタンへ統一し、動画画面と同じ操作感を保ちます。 */}
                    <fieldset className={`${styles.radioGroup} ${styles.selectWrapperFull}`}>
                      <legend className="sr-only">ステータス</legend>
                      <div className={styles.radioOptions}>
                        {STATUS_OPTIONS.map((option) => {
                          const inputId = `status-${channel.id}-${option.value}`;
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
                                name={`status-${channel.id}`}
                                className={styles.radioInput}
                                value={option.value}
                                checked={isChecked}
                                onChange={(event) =>
                                  setSelections((prev) => ({
                                    ...prev,
                                    [channel.id]: {
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
          prevHref,
          nextHref,
        }}
        bulkControl={{
          selectedCount,
          totalCount: channels.length,
          onToggleAll: handleToggleAll,
          onSubmit: handleSubmit,
          submitting,
        }}
      />
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
        className={styles.thumbnailLink}
        aria-label={`${channel.name} の最新動画を開く`}
      >
        <Image
          src={thumbnailUrl}
          alt={channel.latestVideoTitle ?? `${channel.name} の最新動画`}
          fill
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
          className={styles.thumbnailImage}
        />
      </a>
    );
  }
  if (channel.latestVideoTitle) {
    return (
      <div className={styles.thumbnailFallback}>
        {channel.latestVideoTitle}
      </div>
    );
  }
  return (
    <div className={styles.thumbnailFallback}>
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

function createSelectionEntry(channel: ChannelRow, registeredView: boolean): ChannelSelection {
  if (registeredView) {
    // 登録済み一覧では既存データを丁寧に初期値へ反映し、無用な再入力を避けます。
    const status = channel.status === null || channel.status === undefined ? "" : String(channel.status);
    return {
      selected: true,
      status,
    };
  }

  return {
    selected: true,
    status: "2",
  };
}
