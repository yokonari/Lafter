export type VideoItem = {
  id: string;
  title: string;
  videoId: string;
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
  url: string;
  title: string;
  published_at?: number;
  channel_name?: string | null;
};

type RawPlaylist = {
  url: string;
  title: string;
};

function parseYoutubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1);
    }
    const vParam = parsed.searchParams.get("v");
    if (vParam) {
      return vParam;
    }
    const match = parsed.pathname.match(/\/embed\/([A-Za-z0-9_-]{11})/);
    if (match && match[1]) {
      return match[1];
    }
  } catch {
    // fallback to regex
  }

  const regex = /(?:(?:v=)|(?:youtu\.be\/))([A-Za-z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function buildThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

function parsePlaylistId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const listParam = parsed.searchParams.get("list");
    if (listParam) return listParam;
  } catch {
    // fallback to regex
  }
  const match = url.match(/list=([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

function mapRawVideo(video: RawVideo): VideoItem | null {
  const videoId = parseYoutubeId(video.url);
  if (!videoId) {
    return null;
  }

  return {
    id: videoId,
    videoId,
    title: video.title,
    thumbnail: buildThumbnailUrl(videoId),
    channelName: video.channel_name ?? undefined,
  };
}

function mapRawPlaylist(playlist: RawPlaylist): PlaylistItem | null {
  const playlistId = parsePlaylistId(playlist.url);
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
