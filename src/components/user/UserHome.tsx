'use client';

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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


import { ReportDialog } from "./ReportDialog";
import { ScrollTopButton } from "./ScrollTopButton";
import styles from "./userTheme.module.scss";

// トースト通知の外観を統一し、暗色テーマの世界観を崩さないよう共有設定を用意します。
const userToastAppearanceOptions = {
  className: "userToast",
} as const;

export function UserHome() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [activeChannelId, setActiveChannelId] = useState<string | undefined>(undefined);
  const [activeMode, setActiveMode] = useState<"new" | "random" | undefined>(undefined);
  const [isSearching, setIsSearching] = useState(false);
  const [dialogVideo, setDialogVideo] = useState<VideoItem | null>(null);
  const [dialogPlaylist, setDialogPlaylist] = useState<PlaylistItem | null>(null);
  const [reportVideo, setReportVideo] = useState<VideoItem | null>(null);


  // 検索履歴関連の状態
  const [history, setHistory] = useState<string[]>([]);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const HISTORY_KEY = "userSearchHistory";

  // URL パラメーターを置換し、検索条件を共有するためのヘルパーです。
  const updateUrl = useCallback(
    (next: { query?: string; channelId?: string; mode?: "new" | "random" | undefined }) => {
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
      if (next.mode) {
        params.set("mode", next.mode);
      } else {
        params.delete("mode");
      }
      const queryString = params.toString();
      const nextUrl = queryString ? `${pathname}?${queryString}` : pathname;
      const currentQuery = searchParams.toString();
      const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname;
      if (nextUrl !== currentUrl) {
        router.push(nextUrl);
      }
    },
    [pathname, router, searchParams],
  );

  // パラメーターが変わったときに状態を復元し、ブラウザ戻るなどでも一貫させます。
  useEffect(() => {
    const urlQuery = searchParams.get("q") ?? "";
    const urlChannelId = searchParams.get("channelId") ?? undefined;
    const modeParam = searchParams.get("mode");
    const urlMode = modeParam === "new" || modeParam === "random" ? modeParam : undefined;
    setSearchInput(urlQuery);
    setActiveQuery(urlQuery);
    setActiveChannelId(urlChannelId || undefined);
    setActiveMode(urlMode);
    // クエリ/チャンネル/モードのいずれかが指定されていれば一覧表示へ切り替えます。
    setIsSearching(Boolean(urlQuery || urlChannelId || urlMode));
  }, [searchParams]);

  // ローカルストレージから検索履歴を丁寧に読み込みます。
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(HISTORY_KEY) : null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHistory(parsed.filter((item): item is string => typeof item === "string"));
        }
      } catch {
        // 破損した場合は無視して再生成します。
      }
    }
  }, []);

  const persistHistory = (next: string[]) => {
    setHistory(next);
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      // ストレージ書き込み失敗時も UI は継続します。
    }
  };

  const handleHistoryDelete = (item: string) => {
    const nextHistory = history.filter((h) => h !== item);
    persistHistory(nextHistory);
  };

  // 検索ワードを API へ丁寧に記録し、失敗時は UI を止めずにログへ残します。
  const logSearchKeyword = async (keyword: string) => {
    try {
      const res = await fetch("/api/search-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });
      if (!res.ok) {
        console.warn("検索ログ送信に失敗しました", res.status);
      }
    } catch (error) {
      console.error("検索ログ送信中に例外が発生しました", error);
    }
  };

  // ブランドロゴ押下でトップ状態に戻す
  const handleReset = useCallback(() => {
    setSearchInput("");
    setActiveQuery("");
    setActiveChannelId(undefined);
    setActiveMode(undefined);
    setIsSearching(false);
    updateUrl({ query: "", channelId: undefined, mode: undefined });
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
  const handleChannelSelect = useCallback((channelId: string) => {
    setSearchInput("");
    setActiveQuery("");
    setActiveChannelId(channelId);
    setActiveMode(undefined);
    setIsSearching(true);
    updateUrl({ query: "", channelId, mode: undefined });
  }, [updateUrl]);

  // 「最近」「ランダム」の一覧表示へ遷移するハンドラーです。ホーム表示から動画一覧へスムーズに切り替えます。
  const handleShowNewList = useCallback(() => {
    setSearchInput("");
    setActiveQuery("");
    setActiveChannelId(undefined);
    setActiveMode("new");
    setIsSearching(true);
    updateUrl({ query: "", channelId: undefined, mode: "new" });
  }, [updateUrl]);

  const handleShowRandomList = useCallback(() => {
    setSearchInput("");
    setActiveQuery("");
    setActiveChannelId(undefined);
    setActiveMode("random");
    setIsSearching(true);
    updateUrl({ query: "", channelId: undefined, mode: "random" });
  }, [updateUrl]);

  // 報告の選択で確認ダイアログを開きます。
  const handleReportSelect = useCallback((video: VideoItem) => {
    setReportVideo(video);
  }, []);

  const handleReportClose = useCallback(() => {
    setReportVideo(null);
  }, []);

  const handleReportSuccess = useCallback(() => {
    toast.success("ご報告ありがとうございました！", userToastAppearanceOptions);
  }, []);

  const performSearch = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    // 履歴更新
    setHistory((prev) => {
      const next = [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, 10);
      try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch { }
      return next;
    });

    void logSearchKeyword(trimmed);

    setActiveQuery(trimmed);
    setActiveChannelId(undefined);
    setActiveMode(undefined);
    setIsSearching(true);
    setIsMobileSearchOpen(false);
    updateUrl({ query: trimmed, channelId: undefined, mode: undefined });
  }, [updateUrl]);

  // 復元処理中かどうかを管理し、復元中のスクロールイベントによる誤った上書き保存を防ぎます。




  return (
    // 管理画面と同様に全体をダークトーンで包み込み、視覚的な統一感を丁寧に確保します。
    <motion.div
      className={styles.userLayout}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <UserHeader
        query={searchInput}
        onQueryChange={setSearchInput}
        onSearch={performSearch}
        onReset={handleReset}
        history={history}
        onHistorySelect={performSearch}
        onHistoryDelete={handleHistoryDelete}
        isMobileSearchOpen={isMobileSearchOpen}
        onMobileSearchOpen={() => setIsMobileSearchOpen(true)}
        onMobileSearchClose={() => setIsMobileSearchOpen(false)}
      />

      {/* メインも暗めの背景に切り替え、上部ヘッダーとの境界を自然に馴染ませます。 */}
      {/* ヘッダー高さに合わせて上部余白も56px（pt-14）に揃え、重なりを防ぎます。 */}
      <main className={styles.main}>
        <AnimatePresence mode="wait">
          {isSearching && (activeQuery || activeChannelId || activeMode) ? (
            <motion.div
              key="search-results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <SearchResults
                query={activeQuery}
                channelId={activeChannelId}
                mode={activeMode}
                onVideoSelect={handleVideoSelect}
                onPlaylistSelect={handlePlaylistSelect}
                onChannelSelect={handleChannelSelect}
                onBackToTop={handleReset}
              />
            </motion.div>
          ) : (
            <motion.div
              key="home-sections"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <HomeSections
                onVideoSelect={handleVideoSelect}
                onChannelSelect={handleChannelSelect}
                onShowNewList={handleShowNewList}
                onShowRandomList={handleShowRandomList}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* スクロール可能なときにのみ表示し、ワンクリックでトップへ戻れる固定ボタンです。 */}
      <ScrollTopButton />

      <UserFooter />

      <VideoDialog
        video={dialogVideo}
        onClose={() => setDialogVideo(null)}
        onReport={handleReportSelect}
      />
      <PlaylistDialog
        playlist={dialogPlaylist}
        onClose={() => setDialogPlaylist(null)}
      />

      <ReportDialog open={Boolean(reportVideo)} video={reportVideo} onClose={handleReportClose} onSuccess={handleReportSuccess} />

      <ToastContainer position="top-center" theme="dark" />
    </motion.div>
  );
}
