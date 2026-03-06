"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { AdminTabsLayout } from "../../components/AdminTabsLayout";
import { useAdminToast } from "../../hooks/useAdminToast";
import styles from "../../adminTheme.module.scss";

type Channel = {
    id: string;
    name: string;
    url: string;
    latestVideoTitle?: string | null;
    latestVideoId?: string | null;
};

export default function VideoSearchPage() {
    const router = useRouter();
    const [keyword, setKeyword] = useState("");
    const [searching, setSearching] = useState(false);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
    const [maxPages, setMaxPages] = useState(2);
    const [periodOption, setPeriodOption] = useState<"1y" | "none">("1y");
    const [orderOption, setOrderOption] = useState<"default" | "date">("default");
    const [useKeyword, setUseKeyword] = useState(true);
    const [searchKeyword, setSearchKeyword] = useState("ネタ");
    const [executing, setExecuting] = useState(false);

    // トースト通知の統一
    useAdminToast();

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!keyword.trim()) return;

        setSearching(true);
        setChannels([]);
        setSelectedChannelId(null);

        try {
            const params = new URLSearchParams();
            params.set("q", keyword.trim());
            params.set("page", "1");
            // ステータス1（OK）のチャンネルのみを検索対象とします。
            params.set("channel_status", "1");

            const res = await fetch(`/api/admin/channels?${params.toString()}`);
            if (!res.ok) throw new Error("チャンネル検索に失敗しました");

            const data = await res.json() as { channels: Record<string, unknown>[] };
            const mapped = (data.channels || []).map((c) => ({
                id: String(c.id),
                name: String(c.name),
                url: String(c.url),
                latestVideoTitle: typeof c.latest_video_title === "string" ? c.latest_video_title : null,
                latestVideoId: typeof c.latest_video_id === "string" ? c.latest_video_id : null,
            }));
            setChannels(mapped);

            if (mapped.length === 0) {
                toast.info("該当するチャンネルが見つかりませんでした。");
            }
        } catch (err) {
            toast.error("検索中にエラーが発生しました。");
            console.error(err);
        } finally {
            setSearching(false);
        }
    };

    const handleExecute = async () => {
        if (!selectedChannelId) return;

        setExecuting(true);
        try {
            let publishedAfter: string | undefined;
            if (periodOption === "1y") {
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                publishedAfter = oneYearAgo.toISOString();
            }

            const res = await fetch("/api/admin/channels/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    channelId: selectedChannelId,
                    publishedAfter,
                    maxPages,
                    // default は未指定として扱い、既存のAPIデフォルト挙動を維持します。
                    order: orderOption === "date" ? "date" : undefined,
                    useKeyword,
                    searchKeyword: useKeyword ? searchKeyword.trim() : undefined,
                }),
            });

            if (!res.ok) {
                const errorData = await res.json() as { message?: string };
                throw new Error(errorData.message || "動画検索に失敗しました");
            }

            const data = await res.json() as { videosInserted: number };
            toast.success(`検索完了: 動画${data.videosInserted}件を追加しました。`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "予期せぬエラーが発生しました";
            toast.error(msg);
        } finally {
            setExecuting(false);
        }
    };

    return (
        <AdminTabsLayout activeTab="channels">
            <div className={styles.section}>
                <div className={styles.header}>
                    <h2 className={styles.headerTitle}>
                        チャンネル指定でYouTube Search APIを最大6P取得します。
                    </h2>
                </div>

                <div className={styles.card}>
                    <div className={styles.cardBody}>
                        {/* 検索フォーム */}
                        <section className={styles.searchSection}>
                            <form onSubmit={handleSearch} className={styles.form}>
                                <div className={styles.inputWrapper}>
                                    <input
                                        type="text"
                                        value={keyword}
                                        onChange={(e) => setKeyword(e.target.value)}
                                        placeholder="チャンネル名を入力して検索（ステータスOKのみ）"
                                        className={styles.input}
                                        disabled={searching}
                                    />
                                    <button
                                        type="submit"
                                        disabled={searching || !keyword.trim()}
                                        className={styles.primaryButton}
                                        style={{ marginLeft: "0.5rem", padding: "0.5rem", aspectRatio: "1/1", display: "flex", alignItems: "center", justifyContent: "center" }}
                                        aria-label="検索"
                                    >
                                        {searching ? (
                                            <Loader2 className="animate-spin" size={20} />
                                        ) : (
                                            <Search size={20} />
                                        )}
                                    </button>
                                </div>
                            </form>
                        </section>

                        {/* コンテンツエリア */}
                        {channels.length > 0 && (
                            <div className="mt-8 space-y-6">
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                                        検索結果 ({channels.length}件)
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {channels.map((channel) => (
                                            <label
                                                key={channel.id}
                                                className={`
                          relative flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors
                          ${selectedChannelId === channel.id
                                                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                                                    }
                        `}
                                            >
                                                <input
                                                    type="radio"
                                                    name="channel"
                                                    value={channel.id}
                                                    checked={selectedChannelId === channel.id}
                                                    onChange={() => setSelectedChannelId(channel.id)}
                                                    className="mt-1"
                                                />

                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">
                                                        {channel.name}
                                                    </div>

                                                    {channel.latestVideoTitle ? (
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            <span className="font-medium">最新:</span> {channel.latestVideoTitle}
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-gray-400 italic mt-1">
                                                            動画情報なし
                                                        </div>
                                                    )}
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* アクションフッター */}
                                <div className="flex items-center justify-between pt-6 border-t border-gray-100 dark:border-gray-800">
                                    <div className="text-sm text-gray-500 dark:text-gray-400">
                                        {selectedChannelId ? (
                                            <span>
                                                選択中のチャンネル: <strong className="text-gray-900 dark:text-gray-200">{channels.find(c => c.id === selectedChannelId)?.name}</strong>
                                            </span>
                                        ) : (
                                            "リストからチャンネルを選択してください"
                                        )}
                                    </div>

                                    {/* 条件入力と実行操作を2段に分け、横詰まりを避けます。 */}
                                    <div className="mt-6 flex flex-col items-end gap-3">
                                        <div className="flex flex-wrap items-center justify-end gap-3">
                                            <div className="flex items-center gap-2">
                                                <label htmlFor="maxPages" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    取得ページ数:
                                                </label>
                                                <select
                                                    id="maxPages"
                                                    value={maxPages}
                                                    onChange={(e) => setMaxPages(parseInt(e.target.value, 10))}
                                                    className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                >
                                                    {Array.from({ length: 6 }, (_, i) => i + 1).map((page) => (
                                                        <option key={page} value={page}>{page}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <label htmlFor="periodOption" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    期間:
                                                </label>
                                                <select
                                                    id="periodOption"
                                                    value={periodOption}
                                                    onChange={(e) => setPeriodOption(e.target.value as "1y" | "none")}
                                                    className="w-28 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                >
                                                    <option value="1y">1年以内</option>
                                                    <option value="none">指定なし</option>
                                                </select>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <label htmlFor="orderOption" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    並び順:
                                                </label>
                                                <select
                                                    id="orderOption"
                                                    value={orderOption}
                                                    onChange={(e) => setOrderOption(e.target.value as "default" | "date")}
                                                    className="w-28 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                >
                                                    <option value="default">デフォルト</option>
                                                    <option value="date">公開日順</option>
                                                </select>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <label htmlFor="useKeyword" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    ワード:
                                                </label>
                                                <select
                                                    id="useKeyword"
                                                    value={useKeyword ? "on" : "off"}
                                                    onChange={(e) => setUseKeyword(e.target.value === "on")}
                                                    className="w-28 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                >
                                                    <option value="on">使用する</option>
                                                    <option value="off">使用しない</option>
                                                </select>
                                            </div>
                                            {useKeyword && (
                                                <div className="flex items-center gap-2">
                                                    <label htmlFor="searchKeyword" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                        検索ワード:
                                                    </label>
                                                    <input
                                                        id="searchKeyword"
                                                        type="text"
                                                        value={searchKeyword}
                                                        onChange={(e) => setSearchKeyword(e.target.value)}
                                                        placeholder="例: ネタ"
                                                        className="w-32 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-end gap-3">
                                            <button
                                                type="button"
                                                onClick={() => router.back()}
                                                className={styles.loginSecondaryButton}
                                                disabled={executing}
                                            >
                                                戻る
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleExecute}
                                                disabled={!selectedChannelId || executing}
                                                className={styles.primaryButton}
                                            >
                                                {executing && <Loader2 className="animate-spin mr-2" size={16} />}
                                                {executing ? "検索中..." : "動画検索を実行"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AdminTabsLayout>
    );
}
