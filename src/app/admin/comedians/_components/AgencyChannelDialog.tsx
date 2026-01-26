"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Trash2, X } from "lucide-react";
import { toast } from "react-toastify";
import styles from "../../adminTheme.module.scss";

type Agency = {
  id: string;
  name: string;
};

type AgencyChannel = {
  channelId: string;
  name: string;
};

type SearchResult = {
  id: string;
  name: string;
};

type AgencyChannelDialogProps = {
  onClose: () => void;
};

export function AgencyChannelDialog({ onClose }: AgencyChannelDialogProps) {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState("");
  const [agencyChannels, setAgencyChannels] = useState<AgencyChannel[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedAgency = useMemo(
    () => agencies.find((agency) => agency.id === selectedAgencyId) ?? null,
    [agencies, selectedAgencyId],
  );

  const fetchAgencies = useCallback(async () => {
    // 事務所一覧を取得して選択肢を更新します。
    try {
      const response = await fetch("/api/admin/agencies");
      if (!response.ok) {
        throw new Error("事務所一覧の取得に失敗しました。");
      }
      const data = (await response.json()) as { agencies: Agency[] };
      setAgencies(data.agencies ?? []);
    } catch (error) {
      console.error("Failed to fetch agencies:", error);
      toast.error("事務所一覧の取得に失敗しました。");
    }
  }, []);

  const fetchAgencyChannels = useCallback(async (agencyId: string) => {
    // 選択中の事務所に紐づくチャンネル一覧を取得します。
    setIsLoadingChannels(true);
    try {
      const response = await fetch(`/api/admin/agency-channels?agencyId=${encodeURIComponent(agencyId)}`);
      if (!response.ok) {
        throw new Error("事務所チャンネルの取得に失敗しました。");
      }
      const data = (await response.json()) as { channels: AgencyChannel[] };
      setAgencyChannels(data.channels ?? []);
    } catch (error) {
      console.error("Failed to fetch agency channels:", error);
      toast.error("事務所チャンネルの取得に失敗しました。");
      setAgencyChannels([]);
    } finally {
      setIsLoadingChannels(false);
    }
  }, []);

  useEffect(() => {
    fetchAgencies();
  }, [fetchAgencies]);

  useEffect(() => {
    if (!selectedAgencyId && agencies.length > 0) {
      // 初回表示時は先頭の事務所を自動選択します。
      setSelectedAgencyId(agencies[0].id);
    }
  }, [agencies, selectedAgencyId]);

  useEffect(() => {
    if (!selectedAgencyId) {
      setAgencyChannels([]);
      return;
    }
    fetchAgencyChannels(selectedAgencyId);
  }, [fetchAgencyChannels, selectedAgencyId]);

  const handleSearch = async () => {
    if (!searchKeyword.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/admin/channels/search?q=${encodeURIComponent(searchKeyword.trim())}`
      );

      if (!response.ok) {
        throw new Error("チャンネル検索に失敗しました。");
      }

      const data = (await response.json()) as { channels: SearchResult[] };
      setSearchResults(data.channels ?? []);
    } catch (error) {
      console.error("Channel search error:", error);
      toast.error("チャンネル検索に失敗しました。");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddChannel = (channel: SearchResult) => {
    if (agencyChannels.some((item) => item.channelId === channel.id)) {
      return;
    }
    // 検索結果から選択したチャンネルを追加します。
    setAgencyChannels((prev) => [
      ...prev,
      { channelId: channel.id, name: channel.name },
    ]);
    setSearchResults([]);
    setSearchKeyword("");
  };

  const handleRemoveChannel = (channelId: string) => {
    // 選択済みのチャンネルを一覧から削除します。
    setAgencyChannels((prev) => prev.filter((item) => item.channelId !== channelId));
  };

  const handleSave = async () => {
    if (!selectedAgencyId) {
      toast.error("事務所を選択してください。");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/admin/agency-channels?agencyId=${encodeURIComponent(selectedAgencyId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channels: agencyChannels.map((channel) => ({
              channelId: channel.channelId,
              name: channel.name,
            })),
          }),
        }
      );

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          result && typeof result === "object" && "message" in result && typeof result.message === "string"
            ? result.message
            : "事務所チャンネルの更新に失敗しました。";
        throw new Error(message);
      }

      toast.success("事務所チャンネルを更新しました。");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "事務所チャンネルの更新に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div
        className={`${styles.dialog} ${styles.dialogLarge}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dialogHeader}>
          <h2 className={styles.dialogTitle}>事務所チャンネル管理</h2>
          <button
            type="button"
            onClick={onClose}
            className={styles.dialogCloseButton}
            aria-label="閉じる"
          >
            <X size={24} />
          </button>
        </div>
        <div className={styles.dialogBody}>
          <div className={styles.formGroup}>
            <label htmlFor="agencySelect" className={styles.label}>
              事務所
            </label>
            <select
              id="agencySelect"
              value={selectedAgencyId}
              onChange={(e) => setSelectedAgencyId(e.target.value)}
              className={styles.input}
            >
              <option value="">選択してください</option>
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name}
                </option>
              ))}
            </select>
            {selectedAgency && (
              <p className={styles.statusText}>
                選択中: {selectedAgency.name}（{selectedAgency.id}）
              </p>
            )}
          </div>

          <div className={styles.channelSelector}>
            <label className={styles.label}>チャンネル検索</label>
            <div className={styles.searchBox}>
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                placeholder="チャンネル名で検索"
                className={styles.input}
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={isSearching}
                className={styles.searchButton}
              >
                <Search size={20} />
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className={styles.searchResults}>
                {searchResults.map((channel) => {
                  const isSelected = agencyChannels.some(
                    (item) => item.channelId === channel.id
                  );
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => handleAddChannel(channel)}
                      disabled={isSelected}
                      className={`${styles.searchResultItem} ${isSelected ? styles.searchResultItemDisabled : ""}`}
                    >
                      <span>{channel.name}</span>
                      {isSelected && <span className={styles.badge}>選択済み</span>}
                    </button>
                  );
                })}
              </div>
            )}

            <div className={styles.selectedChannels}>
              <p className={styles.subLabel}>紐付け済みチャンネル</p>
              {isLoadingChannels ? (
                <p className={styles.statusText}>読み込み中...</p>
              ) : agencyChannels.length === 0 ? (
                <p className={styles.statusText}>登録済みチャンネルはありません。</p>
              ) : (
                agencyChannels.map((channel) => (
                  <div key={channel.channelId} className={styles.selectedChannelItem}>
                    <div className={styles.channelInfo}>
                      <strong>{channel.name}</strong>
                      <button
                        type="button"
                        onClick={() => handleRemoveChannel(channel.channelId)}
                        className={styles.iconButton}
                        aria-label="削除"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <div className={styles.dialogFooter}>
          <button
            type="button"
            onClick={onClose}
            className={styles.secondaryButton}
            disabled={isSaving}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={styles.primaryButton}
            disabled={isSaving || !selectedAgencyId}
          >
            {isSaving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
