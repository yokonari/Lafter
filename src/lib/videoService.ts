export type VideoItem = {
  id: string;
  title: string;
  thumbnail: string;
  channelName?: string;
};

export type PlaylistItem = {
  id: string;
  title: string;
  playlistId: string;
  thumbnail?: string;
};

type RawVideo = {
  id: string;
  title: string;
  published_at?: number;
  channel_name?: string | null;
};

type RawPlaylist = {
  id: string;
  title: string;
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
    channelName: video.channel_name ?? undefined,
  };
}

function mapRawPlaylist(playlist: RawPlaylist): PlaylistItem | null {
  const playlistId = playlist.id;
  if (!playlistId) {
    return null;
  }

  // プレイリストのサムネイルはAPIから取得できないため、ここでは未設定で扱います。
  return {
    id: playlistId,
    playlistId,
    title: playlist.title,
  };
}

export type FetchVideoOptions = {
  query?: string;
  signal?: AbortSignal;
  mode?: "new" | "random";
  limit?: number;
  offset?: number;
  includePlaylists?: boolean;
};

export type FetchVideosResponse = {
  videos: VideoItem[];
  playlists: PlaylistItem[];
};

export async function fetchVideoItems(
  fetchFn: typeof fetch,
  options?: FetchVideoOptions,
): Promise<FetchVideosResponse> {
  const params = new URLSearchParams();
  if (options?.query) {
    params.set("q", options.query);
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

  const payload = (await response.json()) as {
    videos?: RawVideo[];
    play_lists?: RawPlaylist[];
  };

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

  return { videos: videoItems, playlists: playlistItems };
}
