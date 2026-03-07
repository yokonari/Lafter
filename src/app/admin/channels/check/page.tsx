"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { AdminTabsLayout } from "../../components/AdminTabsLayout";
import { useAdminToast } from "../../hooks/useAdminToast";
import styles from "../../adminTheme.module.scss";

type ChannelResult = {
  id: string;
  name: string;
  url: string;
};

type ChannelCheckSummary = {
  checked: number;
  confirmed: number;
  nameUpdated: number;
  missing: number;
  deleted: number;
};

export default function ChannelCheckPage() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ChannelResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [checkSummary, setCheckSummary] = useState<ChannelCheckSummary | null>(null);

  useAdminToast();

  const handleSearch = async () => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setResults([]);
      setSelectedIds([]);
      return;
    }

    setSearching(true);
    try {
      const params = new URLSearchParams();
      params.set("q", trimmed);
      params.set("page", "1");
      // 検索対象は status=1 のみとし、存在チェック対象を明確に限定します。
      params.set("channel_status", "1");
      const response = await fetch(`/api/admin/channels?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | {
          message?: string;
          channels?: Array<{ id: string; name: string; url: string }>;
        }
        | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "チャンネル検索に失敗しました。");
      }

      const items = Array.isArray(payload?.channels)
        ? payload.channels.map((item) => ({
          id: item.id,
          name: item.name,
          url: item.url,
        }))
        : [];
      setResults(items);
      setSelectedIds([]);
      // 検索条件が変わったら直前の実行結果表示をリセットします。
      setCheckSummary(null);
      if (items.length === 0) {
        toast.info("該当するチャンネルが見つかりませんでした。");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "チャンネル検索中にエラーが発生しました。";
      toast.error(message);
      setResults([]);
      setSelectedIds([]);
    } finally {
      setSearching(false);
    }
  };

  const toggleSelection = (channelId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        return prev.includes(channelId) ? prev : [...prev, channelId];
      }
      return prev.filter((id) => id !== channelId);
    });
  };

  const handleExecute = async () => {
    if (selectedIds.length === 0) {
      toast.error("存在チェック対象のチャンネルを選択してください。");
      return;
    }

    setSubmitting(true);
    try {
      // 選択したチャンネルIDのみを存在チェックAPIへ渡して実行します。
      const response = await fetch("/api/admin/channels/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelIds: selectedIds }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
          message?: string;
          checked?: number;
          confirmed?: number;
          nameUpdated?: number;
          missing?: number;
          deleted?: number;
        }
        | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "チャンネル存在チェックに失敗しました。");
      }

      toast.success(
        `存在チェック完了: チェック=${payload?.checked ?? 0}件 / 名前更新=${payload?.nameUpdated ?? 0}件 / 削除=${payload?.deleted ?? 0}件`,
      );
      // 実行結果を保持し、ボタン下で確認できるようにします。
      setCheckSummary({
        checked: payload?.checked ?? 0,
        confirmed: payload?.confirmed ?? 0,
        nameUpdated: payload?.nameUpdated ?? 0,
        missing: payload?.missing ?? 0,
        deleted: payload?.deleted ?? 0,
      });
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "チャンネル存在チェック中にエラーが発生しました。";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminTabsLayout activeTab="channels">
      <div className={styles.section}>
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>チャンネル存在チェック</h2>
        </div>

        <div className={styles.card}>
          <div className={styles.cardBody}>
            <p className={styles.registerDescription}>
              チャンネル名で検索し、チェック対象を複数選択して存在チェックを実行します。
            </p>

            <div className={styles.searchBox}>
              <input
                type="text"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSearch();
                  }
                }}
                placeholder="チャンネル名で検索（ステータスOKのみ）"
                className={styles.input}
              />
              <button
                type="button"
                onClick={() => void handleSearch()}
                disabled={searching}
                className={styles.searchButton}
              >
                {searching ? "検索中..." : "検索"}
              </button>
            </div>

            {results.length > 0 ? (
              <>
                <div className={styles.channelCheckSelectionRow}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={selectedIds.length === results.length}
                      onChange={(event) => {
                        if (event.target.checked) {
                          // 表示中の検索結果を一括選択し、まとめてチェックできるようにします。
                          setSelectedIds(results.map((item) => item.id));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                    />
                    <span>全選択</span>
                  </label>
                  <span className={styles.channelCheckCount}>
                    {selectedIds.length} / {results.length} 件選択中
                  </span>
                </div>

                <div className={styles.channelCheckResults}>
                  {results.map((channel) => {
                    const checked = selectedIds.includes(channel.id);
                    return (
                      <label key={channel.id} className={styles.channelCheckResultItem}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => toggleSelection(channel.id, event.target.checked)}
                        />
                        <span className={styles.channelCheckResultName}>{channel.name}</span>
                        <span className={styles.channelCheckResultId}>{channel.id}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className={styles.channelCheckHint}>検索結果はここに表示されます。</p>
            )}

            <div className={styles.buttonRow}>
              <button
                type="button"
                onClick={() => router.push("/admin/channels")}
                className={styles.loginSecondaryButton}
                disabled={submitting}
              >
                戻る
              </button>
              <button
                type="button"
                onClick={handleExecute}
                className={styles.primaryButton}
                disabled={submitting || selectedIds.length === 0}
              >
                {submitting ? "存在チェック実行中..." : "選択チャンネルを存在チェック"}
              </button>
            </div>

            {checkSummary && (
              <div className={styles.channelCheckSummary}>
                <p className={styles.channelCheckSummaryTitle}>実行結果</p>
                <p className={styles.channelCheckSummaryText}>
                  チェック対象: {checkSummary.checked}件 / 存在確認: {checkSummary.confirmed}件 / 名前更新: {checkSummary.nameUpdated}件 / 未検出: {checkSummary.missing}件 / 削除反映: {checkSummary.deleted}件
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminTabsLayout>
  );
}
