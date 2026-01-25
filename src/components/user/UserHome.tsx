'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { VideoItem } from "@/lib/videoService";
import { UserHeader } from "./UserHeader";
import { HomeSections } from "./HomeSections";
import { SearchResults } from "./SearchResults";
import { UserFooter } from "./UserFooter";
import { VideoDialog } from "./VideoDialog";


import { ReportDialog } from "./ReportDialog";
import { ScrollTopButton } from "./ScrollTopButton";
import { ComedianIndexContent } from "./ComedianIndexContent";
import styles from "./userTheme.module.scss";
import artistsJson from "../../../data/artists/artists.json";
import agencyJson from "../../../data/agencies/agency.json";
import mediaJson from "../../../data/media/media.json";
import { flattenArtistsByAgency, type ArtistsByAgency } from "../../../data/artists/types";
import type { AgenciesById } from "../../../data/agencies/types";
import type { MediaChannels } from "../../../data/media/types";

// トースト通知の外観を統一し、暗色テーマの世界観を崩さないよう共有設定を用意します。
const userToastAppearanceOptions = {
  className: "userToast",
} as const;

type UserHomeProps = {
  initialChannelId?: string;
  initialMode?: "new" | "random" | "popular" | "award-race";
  initialRace?: "m1" | "koc";
  initialYear?: number;
  initialComedianList?: { slug: string; name: string; kana?: string; startedOn?: string; styles?: string[]; agencyId: string }[];
  initialComedian?: {
    slug: string;
    name: string;
    colors?: string[];
    startedOn?: string; // 芸歴タグ表示用の開始年です。
    styles?: string[]; // 芸風タグ表示用のコードです。
    agencyId?: string; // 事務所チャンネルの参照に使います。
    channels: {
      channelId: string;
      role: string;
    }[];
  };
  // データベースから取得したデータ（オプション、未指定の場合はJSONフォールバック）
  artists?: { slug: string; name: string; kana?: string; startedOn?: string; styles?: string[]; agencyId: string; channels: { channelId: string; role: string; }[] }[];
  agencyChannelIds?: string[];
  mediaChannelIds?: string[];
  agencyLabels?: Record<string, string>;
};

const agencyData = agencyJson as AgenciesById;
const mediaData = mediaJson as MediaChannels;
// 事務所別データを検索用の配列に展開します。
const artists = flattenArtistsByAgency(artistsJson as ArtistsByAgency);

export function UserHome({
  initialChannelId,
  initialMode,
  initialRace,
  initialYear,
  initialComedianList,
  initialComedian,
  artists: artistsProp,
  agencyChannelIds: agencyChannelIdsProp,
  mediaChannelIds: mediaChannelIdsProp,
  agencyLabels: agencyLabelsProp,
}: UserHomeProps = {}) {
  // propsが渡された場合はそちらを使用、なければJSONフォールバック
  const artists = artistsProp ?? flattenArtistsByAgency(artistsJson as ArtistsByAgency);
  const agencyLabels = agencyLabelsProp ?? {};
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [activeChannelId, setActiveChannelId] = useState<string | undefined>(initialChannelId);
  const [activeMode, setActiveMode] = useState<"new" | "random" | "popular" | "award-race" | undefined>(initialMode);
  const [isSearching, setIsSearching] = useState(initialChannelId || initialMode ? true : false);
  const [dialogVideo, setDialogVideo] = useState<VideoItem | null>(null);
  const [reportVideo, setReportVideo] = useState<VideoItem | null>(null);
  const isAwardRaceMode = initialMode === "award-race" || activeMode === "award-race";
  const isComedianListMode = Boolean(initialComedianList && initialComedianList.length > 0);
  const isComedianPageMode = Boolean(initialComedian);
  // official は全動画、official以外は芸人名キーワード検索で絞り込みます。
  const comedianName = initialComedian?.name ?? "";
  const officialChannelIds =
    initialComedian?.channels.filter((channel) => channel.role === "official")
      .map((channel) => channel.channelId) ?? [];
  const agencyChannelIds = useMemo(() => {
    // 所属事務所のチャンネルIDを取得します。
    if (!initialComedian?.agencyId) return [];
    return agencyData.agency[initialComedian.agencyId]?.channels.map((ch) => ch.channelId) ?? [];
  }, [initialComedian?.agencyId]);
  const keywordChannelIds = [
    ...(mediaData.media ?? []).map((channel) => channel.channelId),
    ...agencyChannelIds,
    ...(initialComedian?.channels.filter((channel) => channel.role !== "official")
      .map((channel) => channel.channelId) ?? []),
  ];


  // 検索履歴関連の状態
  const [history, setHistory] = useState<string[]>([]);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const HISTORY_KEY = "userSearchHistory";
  const matchedArtists = useMemo(() => {
    // 2文字以上のキーワードのみで芸人名の一致判定を行います。
    const keywords = activeQuery
      .split(/\s+/u)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2);
    if (!activeQuery || keywords.length === 0) {
      return [];
    }
    const normalizedKeywords = keywords.map((word) => word.normalize("NFC").toLowerCase());
    return artists
      .filter((artist) => {
        const nameNfc = artist.name.normalize("NFC").toLowerCase();
        const nameNfd = artist.name.normalize("NFD").toLowerCase();
        return normalizedKeywords.every((word) => nameNfc.includes(word) || nameNfd.includes(word));
      })
      .map((artist) => ({ slug: artist.slug, name: artist.name }));
  }, [activeQuery]);

  // URL パラメーターを置換し、検索条件を共有するためのヘルパーです。
  // モードは固定パスで処理されるため、periodパラメータのみを管理します。
  const updateUrl = useCallback(
    (next: {
      query?: string;
      period?: "month" | "year" | "all" | undefined;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmedQuery = next.query?.trim() ?? "";
      if (trimmedQuery) {
        params.set("q", trimmedQuery);
      } else {
        params.delete("q");
      }
      if (next.period) {
        params.set("period", next.period);
      } else {
        params.delete("period");
      }
      // ホームに戻る際は、sort と videosOnly パラメータも削除します。
      if (!trimmedQuery) {
        params.delete("sort");
        params.delete("videosOnly");
        params.delete("race");
        params.delete("year");
      }
      const queryString = params.toString();
      const nextUrl = queryString ? `/?${queryString}` : "/";
      const currentQuery = searchParams.toString();
      const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname;
      if (nextUrl !== currentUrl) {
        router.push(nextUrl);
      }
    },
    [pathname, router, searchParams],
  );

  // パラメーターが変わったときに状態を復元し、ブラウザ戻るなどでも一貫させます。
  // initialChannelId や initialMode がある場合は、それを優先します。
  useEffect(() => {
    // initialChannelId がある場合は、URL パラメータを無視してチャンネル表示を維持します。
    if (initialChannelId) {
      setActiveChannelId(initialChannelId);
      setIsSearching(true);
      return;
    }

    // 芸人ページ/一覧が固定表示の場合は検索状態を変更しません。
    if (isComedianListMode || isComedianPageMode) {
      return;
    }

    // initialMode がある場合は、URL パラメータを無視してモード表示を維持します。
    if (initialMode) {
      setActiveMode(initialMode);
      setIsSearching(true);
      return;
    }

    const urlQuery = searchParams.get("q") ?? "";
    setSearchInput(urlQuery);
    setActiveQuery(urlQuery);
    setActiveChannelId(undefined);
    setActiveMode(undefined);
    // クエリが指定されていれば一覧表示へ切り替えます。
    setIsSearching(Boolean(urlQuery));
  }, [searchParams, initialChannelId, initialMode, isComedianListMode, isComedianPageMode]);

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
    // initialChannelId や initialMode がある場合（固定パスから呼ばれた場合）は、
    // トップページにリダイレクトします。
    if (initialChannelId || initialMode || isComedianListMode || isComedianPageMode) {
      router.push("/");
      return;
    }

    setSearchInput("");
    setActiveQuery("");
    setActiveChannelId(undefined);
    setActiveMode(undefined);
    setIsSearching(false);
    setIsMobileSearchOpen(false); // モバイル検索モードも閉じる
    updateUrl({ query: "" });
  }, [updateUrl, initialChannelId, initialMode, router]);

  // 動画カードの選択でモーダル表示を開く
  const handleVideoSelect = useCallback((video: VideoItem) => {
    setDialogVideo(video);
  }, []);

  // チャンネル名クリックで新しい /channel/[id] ルートへ遷移
  const handleChannelSelect = useCallback((channelId: string) => {
    router.push(`/channel/${channelId}`);
  }, [router]);

  // モード選択ハンドラーを固定パスにナビゲートするように変更します。
  const handleShowNewList = useCallback(() => {
    router.push("/new");
  }, [router]);

  const handleShowRandomList = useCallback(() => {
    router.push("/random");
  }, [router]);

  const handleShowPopularList = useCallback(() => {
    router.push("/popular");
  }, [router]);

  const handleShowAwardRaceList = useCallback(() => {
    // デフォルトの賞レースページ（M-1 2025）にナビゲート
    router.push("/award-race/m1/2025");
  }, [router]);
  const handleShowComedianList = useCallback(() => {
    // 芸人一覧ページへ遷移します。
    router.push("/comedian");
  }, [router]);

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
    updateUrl({ query: trimmed });
  }, [updateUrl]);

  // 復元処理中かどうかを管理し、復元中のスクロールイベントによる誤った上書き保存を防ぎます。




  const mainContent = isComedianListMode ? (
    <ComedianIndexContent artists={initialComedianList ?? []} agencyLabels={agencyLabels} onBackToTop={handleReset} />
  ) : isComedianPageMode ? (
    <SearchResults
      query=""
      channelIds={officialChannelIds}
      channelQuery={keywordChannelIds.length > 0 ? comedianName : undefined}
      channelIdsForQuery={keywordChannelIds}
      comedianMeta={{
        // 芸人個別ページで芸歴・芸風・事務所タグを表示します。
        startedOn: initialComedian?.startedOn,
        styles: initialComedian?.styles,
        agencyId: initialComedian?.agencyId,
      }}
      titleOverride={`${comedianName}の公式ネタ動画`}
      showComedianListLink
      agencyLabels={agencyLabels}
      onVideoSelect={handleVideoSelect}
      onChannelSelect={handleChannelSelect}
      onBackToTop={handleReset}
    />
  ) : isAwardRaceMode ? (
    <>
      {isSearching && (activeQuery || activeChannelId || activeMode) ? (
        <SearchResults
          query={activeQuery}
          channelId={activeChannelId}
          mode={activeMode}
          artistMatches={matchedArtists}
          agencyLabels={agencyLabels}
          onVideoSelect={handleVideoSelect}
          onChannelSelect={handleChannelSelect}
          onBackToTop={handleReset}
          initialRace={initialRace}
          initialYear={initialYear}
        />
      ) : (
        <HomeSections
          onVideoSelect={handleVideoSelect}
          onChannelSelect={handleChannelSelect}
          onShowNewList={handleShowNewList}
          onShowRandomList={handleShowRandomList}
          onShowPopularList={handleShowPopularList}
          onShowAwardRaceList={handleShowAwardRaceList}
          onShowComedianList={handleShowComedianList}
        />
      )}
    </>
  ) : (
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
            artistMatches={matchedArtists}
            agencyLabels={agencyLabels}
            onVideoSelect={handleVideoSelect}
            onChannelSelect={handleChannelSelect}
            onBackToTop={handleReset}
            initialRace={initialRace}
            initialYear={initialYear}
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
            onShowPopularList={handleShowPopularList}
            onShowAwardRaceList={handleShowAwardRaceList}
            onShowComedianList={handleShowComedianList}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );

  const content = (
    <>
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
        {mainContent}
      </main>

      {/* スクロール可能なときにのみ表示し、ワンクリックでトップへ戻れる固定ボタンです。 */}
      <ScrollTopButton />

      <UserFooter />

      <VideoDialog
        video={dialogVideo}
        onClose={() => setDialogVideo(null)}
        onReport={handleReportSelect}
      />

      <ReportDialog open={Boolean(reportVideo)} video={reportVideo} onClose={handleReportClose} onSuccess={handleReportSuccess} />

      <ToastContainer position="top-center" theme="dark" />
    </>
  );

  return isAwardRaceMode ? (
    <div className={styles.userLayout}>{content}</div>
  ) : (
    // 管理画面と同様に全体をダークトーンで包み込み、視覚的な統一感を丁寧に確保します。
    <motion.div
      className={styles.userLayout}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {content}
    </motion.div>
  );
}
