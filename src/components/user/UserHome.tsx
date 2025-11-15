'use client';

import { useCallback, useState } from "react";
import type { VideoItem, PlaylistItem } from "@/lib/videoService";
import { UserHeader } from "./UserHeader";
import { HomeSections } from "./HomeSections";
import { SearchResults } from "./SearchResults";
import { UserFooter } from "./UserFooter";
import { VideoDialog } from "./VideoDialog";
import { PlaylistDialog } from "./PlaylistDialog";
import styles from "./userTheme.module.scss";

export function UserHome() {
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [dialogVideo, setDialogVideo] = useState<VideoItem | null>(null);
  const [dialogPlaylist, setDialogPlaylist] = useState<PlaylistItem | null>(null);

  // ヘッダーから検索が実行されたタイミングを集中管理
  const handleSearch = useCallback((value: string) => {
    setActiveQuery(value);
    setIsSearching(true);
  }, []);

  // ブランドロゴ押下でトップ状態に戻す
  const handleReset = useCallback(() => {
    setSearchInput("");
    setActiveQuery("");
    setIsSearching(false);
  }, []);

  // 動画カードの選択でモーダル表示を開く
  const handleVideoSelect = useCallback((video: VideoItem) => {
    setDialogVideo(video);
  }, []);
  // プレイリストカードの選択でモーダル表示を開く
  const handlePlaylistSelect = useCallback((playlist: PlaylistItem) => {
    setDialogPlaylist(playlist);
  }, []);

  return (
    // 管理画面と同様に全体をダークトーンで包み込み、視覚的な統一感を丁寧に確保します。
    <div className={styles.userLayout}>
      <UserHeader
        query={searchInput}
        onQueryChange={setSearchInput}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      {/* メインも暗めの背景に切り替え、上部ヘッダーとの境界を自然に馴染ませます。 */}
      {/* ヘッダー高さに合わせて上部余白も56px（pt-14）に揃え、重なりを防ぎます。 */}
      <main className={styles.main}>
        {isSearching && activeQuery ? (
          <SearchResults
            query={activeQuery}
            onVideoSelect={handleVideoSelect}
            onPlaylistSelect={handlePlaylistSelect}
          />
        ) : (
          <HomeSections onVideoSelect={handleVideoSelect} onPlaylistSelect={handlePlaylistSelect} />
        )}
      </main>

      <UserFooter />

      <VideoDialog video={dialogVideo} onClose={() => setDialogVideo(null)} />
      <PlaylistDialog playlist={dialogPlaylist} onClose={() => setDialogPlaylist(null)} />
    </div>
  );
}
