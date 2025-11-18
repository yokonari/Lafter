'use client';

import { useCallback, useEffect, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { VideoItem, PlaylistItem } from "@/lib/videoService";
import { UserHeader } from "./UserHeader";
import { HomeSections } from "./HomeSections";
import { SearchResults } from "./SearchResults";
import { UserFooter } from "./UserFooter";
import { VideoDialog } from "./VideoDialog";
import { PlaylistDialog } from "./PlaylistDialog";
import { ContactDialog } from "./ContactDialog";
import { ReportDialog } from "./ReportDialog";
import styles from "./userTheme.module.scss";

export function UserHome() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [activeChannelId, setActiveChannelId] = useState<string | undefined>(undefined);
  const [isSearching, setIsSearching] = useState(false);
  const [dialogVideo, setDialogVideo] = useState<VideoItem | null>(null);
  const [dialogPlaylist, setDialogPlaylist] = useState<PlaylistItem | null>(null);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [reportVideo, setReportVideo] = useState<VideoItem | null>(null);

  // URL パラメーターを置換し、検索条件を共有するためのヘルパーです。
  const updateUrl = useCallback(
    (next: { query?: string; channelId?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmedQuery = next.query?.trim() ?? "";
      if (trimmedQuery) {
        params.set("q", trimmedQuery);
      } else {
        params.delete("q");
      }
      if (next.channelId) {
        params.set("channelId", next.channelId);
      } else {
        params.delete("channelId");
      }
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname);
    },
    [pathname, router, searchParams],
  );

  // パラメーターが変わったときに状態を復元し、ブラウザ戻るなどでも一貫させます。
  useEffect(() => {
    const urlQuery = searchParams.get("q") ?? "";
    const urlChannelId = searchParams.get("channelId") ?? undefined;
    setSearchInput(urlQuery);
    setActiveQuery(urlQuery);
    setActiveChannelId(urlChannelId || undefined);
    setIsSearching(Boolean(urlQuery || urlChannelId));
  }, [searchParams]);

  // ヘッダーから検索が実行されたタイミングを集中管理
  const handleSearch = useCallback((value: string) => {
    setActiveQuery(value);
    setActiveChannelId(undefined);
    setIsSearching(true);
    updateUrl({ query: value, channelId: undefined });
  }, [updateUrl]);

  // ブランドロゴ押下でトップ状態に戻す
  const handleReset = useCallback(() => {
    setSearchInput("");
    setActiveQuery("");
    setActiveChannelId(undefined);
    setIsSearching(false);
    updateUrl({ query: "", channelId: undefined });
  }, [updateUrl]);

  // 動画カードの選択でモーダル表示を開く
  const handleVideoSelect = useCallback((video: VideoItem) => {
    setDialogVideo(video);
  }, []);
  // プレイリストカードの選択でモーダル表示を開く
  const handlePlaylistSelect = useCallback((playlist: PlaylistItem) => {
    setDialogPlaylist(playlist);
  }, []);
  // チャンネル名クリックで検索結果へ遷移
  const handleChannelSelect = useCallback((channelId: string, channelName: string) => {
    setSearchInput("");
    setActiveQuery("");
    setActiveChannelId(channelId);
    setIsSearching(true);
    updateUrl({ query: "", channelId });
  }, [updateUrl]);

  // 報告の選択で確認ダイアログを開きます。
  const handleReportSelect = useCallback((video: VideoItem) => {
    setReportVideo(video);
  }, []);

  const handleReportClose = useCallback(() => {
    setReportVideo(null);
  }, []);

  const handleReportSuccess = useCallback(() => {
    toast.success("ご報告ありがとうございました！");
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
        {isSearching && (activeQuery || activeChannelId) ? (
          <SearchResults
            query={activeQuery}
            channelId={activeChannelId}
            onVideoSelect={handleVideoSelect}
            onPlaylistSelect={handlePlaylistSelect}
            onChannelSelect={handleChannelSelect}
            onReportSelect={handleReportSelect}
          />
        ) : (
          <HomeSections
            onVideoSelect={handleVideoSelect}
            onPlaylistSelect={handlePlaylistSelect}
            onChannelSelect={handleChannelSelect}
            onReportSelect={handleReportSelect}
          />
        )}
      </main>

      <UserFooter onContactClick={() => setIsContactOpen(true)} />

      <VideoDialog video={dialogVideo} onClose={() => setDialogVideo(null)} />
      <PlaylistDialog playlist={dialogPlaylist} onClose={() => setDialogPlaylist(null)} />
      <ContactDialog open={isContactOpen} onClose={() => setIsContactOpen(false)} />
      <ReportDialog open={Boolean(reportVideo)} video={reportVideo} onClose={handleReportClose} onSuccess={handleReportSuccess} />
      <ToastContainer position="bottom-center" theme="dark" />
    </div>
  );
}
