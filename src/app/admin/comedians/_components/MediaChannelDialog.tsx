"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Trash2, X } from "lucide-react";
import { toast } from "react-toastify";
import styles from "../../adminTheme.module.scss";

type MediaChannel = {
  channelId: string;
  name: string;
};

type SearchResult = {
  id: string;
  name: string;
};

type MediaChannelDialogProps = {
  onClose: () => void;
};

export function MediaChannelDialog({ onClose }: MediaChannelDialogProps) {
  const [mediaChannels, setMediaChannels] = useState<MediaChannel[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchMediaChannels = useCallback(async () => {
    // メディアチャンネル一覧を取得します。
    setIsLoadingChannels(true);
    try {
      const response = await fetch("/api/admin/media-channels");
      if (!response.ok) {
        throw new Error("メディアチャンネルの取得に失敗しました。");
      }
      const data = (await response.json()) as { channels: MediaChannel[] };
      setMediaChannels(data.channels ?? []);
    } catch (error) {
      console.error("Failed to fetch media channels:", error);
      toast.error("メディアチャンネルの取得に失敗しました。");
      setMediaChannels([]);
    } finally {
      setIsLoadingChannels(false);
    }
  }, []);

  useEffect(() => {
    fetchMediaChannels();
  }, [fetchMediaChannels]);

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
    if (mediaChannels.some((item) => item.channelId === channel.id)) {
      return;
    }
    // 検索結果から選択したチャンネルを追加します。
    setMediaChannels((prev) => [
      ...prev,
      { channelId: channel.id, name: channel.name },
    ]);
    setSearchResults([]);
    setSearchKeyword("");
  };

  const handleRemoveChannel = (channelId: string) => {
    // 選択済みのチャンネルを一覧から削除します。
    setMediaChannels((prev) => prev.filter((item) => item.channelId !== channelId));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/media-channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channels: mediaChannels.map((channel) => ({
            channelId: channel.channelId,
            name: channel.name,
          })),
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          result && typeof result === "object" && "message" in result && typeof result.message === "string"
            ? result.message
            : "メディアチャンネルの更新に失敗しました。";
        throw new Error(message);
      }

      toast.success("メディアチャンネルを更新しました。");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "メディアチャンネルの更新に失敗しました。");
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
          <h2 className={styles.dialogTitle}>メディアチャンネル管理</h2>
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
                  const isSelected = mediaChannels.some(
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
              ) : mediaChannels.length === 0 ? (
                <p className={styles.statusText}>登録済みチャンネルはありません。</p>
              ) : (
                mediaChannels.map((channel) => (
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
            disabled={isSaving}
          >
            {isSaving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
