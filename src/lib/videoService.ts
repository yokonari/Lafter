export type VideoItem = {
  id: string;
  title: string;
  thumbnail: string;
  channelId?: string;
  channelName?: string;
};

export type PlaylistItem = {
  id: string;
  title: string;
  playlistId: string;
  thumbnail?: string;
  channelId?: string;
  channelName?: string;
  topVideoId?: string;
};

type RawVideo = {
  id: string;
  title: string;
  published_at?: number;
  channel_id?: string | null;
  channel_name?: string | null;
};

type RawPlaylist = {
  id: string;
  title: string;
  channel_id?: string | null;
  channel_name?: string | null;
  top_video_id?: string | null;
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
  };
}

function mapRawPlaylist(playlist: RawPlaylist): PlaylistItem | null {
  const playlistId = playlist.id;
  if (!playlistId) {
    return null;
  }

  // プレイリストは top_video_id があるときのみサムネイルを作成します。
  return {
    id: playlistId,
    playlistId,
    title: playlist.title,
    channelId: playlist.channel_id ?? undefined,
    channelName: playlist.channel_name ?? undefined,
    topVideoId: playlist.top_video_id ?? undefined,
    thumbnail: playlist.top_video_id ? buildThumbnailUrl(playlist.top_video_id) : undefined,
  };
}

export type FetchVideoOptions = {
  query?: string;
  channelId?: string;
  signal?: AbortSignal;
  mode?: "new" | "random";
  limit?: number;
  offset?: number;
  includePlaylists?: boolean;
};

export type FetchVideosResponse = {
  videos: VideoItem[];
  playlists: PlaylistItem[];
  page: number;
  limit: number;
  hasNext: boolean;
};

type VideosApiPayload = {
  videos?: RawVideo[];
  play_lists?: RawPlaylist[];
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
  if (options?.mode) {
    params.set("mode", options.mode);
  }
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }
  if (options?.offset) {
    params.set("offset", String(options.offset));
  }
  if (options?.includePlaylists === false) {
    params.set("includePlaylists", "false");
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

  const playlistItems: PlaylistItem[] = [];
  for (const raw of payload.play_lists ?? []) {
    const mapped = mapRawPlaylist(raw);
    if (mapped) {
      playlistItems.push(mapped);
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
    playlists: playlistItems,
    page,
    limit: responseLimit,
    hasNext,
  };
}
