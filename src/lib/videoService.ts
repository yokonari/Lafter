export type VideoItem = {
  id: string;
  title: string;
  thumbnail: string;
  channelId?: string;
  channelName?: string;
  viewCount?: number; // 再生数を追加
  likeCount?: number; // 高評価数を追加
};



type RawVideo = {
  id: string;
  title: string;
  channel_id?: string | null;
  channel_name?: string | null;
  view_count?: number | null; // 再生数を追加
  like_count?: number | null; // 高評価数を追加
};




function buildThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

function mapRawVideo(video: RawVideo): VideoItem | null {
  const videoId = video.id;
  if (!videoId) {
    return null;
  }

  return {
    id: videoId,
    title: video.title,
    thumbnail: buildThumbnailUrl(videoId),
    channelId: video.channel_id ?? undefined,
    channelName: video.channel_name ?? undefined,
    viewCount: video.view_count ?? undefined, // 再生数をマッピング
    likeCount: video.like_count ?? undefined, // 高評価数をマッピング
  };
}



export type FetchVideoOptions = {
  query?: string;
  channelId?: string;
  channelIds?: string[]; // 複数チャンネル指定のためのID配列
  channelQuery?: string; // 特定チャンネル群だけに適用する検索キーワード
  channelIdsForQuery?: string[]; // キーワード検索対象のチャンネルID配列
  signal?: AbortSignal;
  mode?: "new" | "random" | "popular" | "award-race"; // "popular" と "award-race" を追加
  period?: "all" | "month" | "year"; // 期間フィルタを追加
  sort?: "published" | "views" | "likes"; // ソート順フィルタを追加
  limit?: number;
  offset?: number;

  /**
   * userHome からのアクセス時のみ true を渡し、API 側でキャッシュの再抽選を行います。
   */
  isHome?: boolean;
  /**
   * 芸人個別ページの slug を渡し、API 側で KV キャッシュからの返却を可能にします。
   */
  artistSlug?: string;
};

export type FetchVideosResponse = {
  videos: VideoItem[];

  page: number;
  limit: number;
  hasNext: boolean;
};

type VideosApiPayload = {
  videos?: RawVideo[];

  page?: number;
  limit?: number;
  hasNext?: boolean;
};

export async function fetchVideoItems(
  fetchFn: typeof fetch,
  options?: FetchVideoOptions,
): Promise<FetchVideosResponse> {
  const params = new URLSearchParams();
  if (options?.query) {
    params.set("q", options.query);
  }
  if (options?.channelId) {
    params.set("channelId", options.channelId);
  }
  if (!options?.channelId && options?.channelIds && options.channelIds.length > 0) {
    // 複数チャンネルをまとめて指定できるようカンマ区切りで渡します。
    params.set("channelIds", options.channelIds.join(","));
  }
  if (options?.channelQuery) {
    // 特定チャンネルだけに適用する検索キーワードを渡します。
    params.set("channelQuery", options.channelQuery);
  }
  if (options?.channelIdsForQuery && options.channelIdsForQuery.length > 0) {
    // キーワード検索対象チャンネルをカンマ区切りで渡します。
    params.set("channelIdsForQuery", options.channelIdsForQuery.join(","));
  }
  if (options?.mode) {
    params.set("mode", options.mode);
  }
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }
  if (options?.offset) {
    params.set("offset", String(options.offset));
  }

  if (options?.period) {
    // 期間フィルタを API に渡します。
    params.set("period", options.period);
  }
  if (options?.sort) {
    // ソート順フィルタを API に渡します。
    params.set("sort", options.sort);
  }
  if (options?.isHome) {
    // トップ画面専用の最適化フラグです。false 相当時はクエリを付けず既存挙動を保ちます。
    params.set("isHome", "true");
  }
  if (options?.artistSlug) {
    params.set("artistSlug", options.artistSlug);
  }

  const url = `/api/videos${params.toString() ? `?${params}` : ""}`;
  const response = await fetchFn(url, { signal: options?.signal });

  if (!response.ok) {
    throw new Error("動画情報の取得に失敗しました。");
  }

  const payload = (await response.json()) as VideosApiPayload;

  const videoItems: VideoItem[] = [];
  for (const raw of payload.videos ?? []) {
    const mapped = mapRawVideo(raw);
    if (mapped) {
      videoItems.push(mapped);
    }
  }



  const page = typeof payload.page === "number" && payload.page > 0 ? Math.floor(payload.page) : 1;
  const responseLimit =
    typeof payload.limit === "number" && payload.limit > 0
      ? Math.floor(payload.limit)
      : (options?.limit ?? 20);
  const hasNext = Boolean(payload.hasNext);

  return {
    videos: videoItems,

    page,
    limit: responseLimit,
    hasNext,
  };
}
