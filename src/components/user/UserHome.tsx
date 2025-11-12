'use client';

import { useCallback, useState } from "react";
import type { VideoItem } from "@/lib/videoService";
import { UserHeader } from "./UserHeader";
import { HomeSections } from "./HomeSections";
import { SearchResults } from "./SearchResults";
import { UserFooter } from "./UserFooter";
import { VideoDialog } from "./VideoDialog";

export function UserHome() {
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [dialogVideo, setDialogVideo] = useState<VideoItem | null>(null);

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

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <UserHeader
        query={searchInput}
        onQueryChange={setSearchInput}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      <main className="flex-1 bg-white pt-[73px]">
        {isSearching && activeQuery ? (
          <SearchResults query={activeQuery} onVideoSelect={handleVideoSelect} />
        ) : (
          <HomeSections onVideoSelect={handleVideoSelect} />
        )}
      </main>

      <UserFooter />

      <VideoDialog video={dialogVideo} onClose={() => setDialogVideo(null)} />
    </div>
  );
}
