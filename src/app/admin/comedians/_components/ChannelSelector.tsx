"use client";

import { useState } from "react";
import { Search, X, Trash2 } from "lucide-react";
import styles from "../../adminTheme.module.scss";

export type SelectedChannel = {
  channelId: string;
  name: string;
  role: "official" | "group";
  description?: string;
};

type ChannelSelectorProps = {
  selectedChannels: SelectedChannel[];
  onChange: (channels: SelectedChannel[]) => void;
};

type SearchResult = {
  id: string;
  name: string;
  url: string;
};

export function ChannelSelector({ selectedChannels, onChange }: ChannelSelectorProps) {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

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
      setSearchResults(data.channels || []);
    } catch (error) {
      console.error("Channel search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddChannel = (channel: SearchResult) => {
    // 既に選択済みかチェック
    if (selectedChannels.some((c) => c.channelId === channel.id)) {
      return;
    }

    onChange([
      ...selectedChannels,
      {
        channelId: channel.id,
        name: channel.name,
        role: "official",
      },
    ]);

    // 検索結果をクリア
    setSearchResults([]);
    setSearchKeyword("");
  };

  const handleRemoveChannel = (channelId: string) => {
    onChange(selectedChannels.filter((c) => c.channelId !== channelId));
  };

  const handleRoleChange = (channelId: string, role: "official" | "group") => {
    onChange(
      selectedChannels.map((c) =>
        c.channelId === channelId ? { ...c, role } : c
      )
    );
  };

  const handleDescriptionChange = (channelId: string, description: string) => {
    onChange(
      selectedChannels.map((c) =>
        c.channelId === channelId ? { ...c, description } : c
      )
    );
  };

  return (
    <div className={styles.channelSelector}>
      <label className={styles.label}>
        チャンネル（オプション）
      </label>

      {/* 検索フォーム */}
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

      {/* 検索結果 */}
      {searchResults.length > 0 && (
        <div className={styles.searchResults}>
          {searchResults.map((channel) => {
            const isSelected = selectedChannels.some(
              (c) => c.channelId === channel.id
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

      {/* 選択済みチャンネル一覧 */}
      {selectedChannels.length > 0 && (
        <div className={styles.selectedChannels}>
          <p className={styles.subLabel}>選択済みチャンネル</p>
          {selectedChannels.map((channel) => (
            <div key={channel.channelId} className={styles.selectedChannelItem}>
              <div className={styles.channelInfo}>
                {/* チャンネル名のみ表示します。 */}
                <strong>{channel.name}</strong>
              </div>

              <div className={styles.selectedChannelActions}>
                {/* 役割と削除ボタンを横並びにまとめます。 */}
                <div className={styles.roleSelector}>
                  <label>
                    <input
                      type="radio"
                      name={`role-${channel.channelId}`}
                      value="official"
                      checked={channel.role === "official"}
                      onChange={() => handleRoleChange(channel.channelId, "official")}
                    />
                    <span>公式</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`role-${channel.channelId}`}
                      value="group"
                      checked={channel.role === "group"}
                      onChange={() => handleRoleChange(channel.channelId, "group")}
                    />
                    <span>グループ</span>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveChannel(channel.channelId)}
                  className={styles.iconButton}
                  aria-label="削除"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              <input
                type="text"
                value={channel.description || ""}
                onChange={(e) =>
                  handleDescriptionChange(channel.channelId, e.target.value)
                }
                placeholder="説明（オプション）"
                className={styles.smallInput}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
