export type VideoCategoryLabel = "漫才" | "コント" | "その他";

export type VideoItem = {
  id: string;
  title: string;
  videoId: string;
  thumbnail: string;
  category?: VideoCategoryLabel;
};

type RawVideo = {
  url: string;
  title: string;
  published_at?: number;
  category?: number;
};

const categoryLabelMap: Record<number, VideoCategoryLabel> = {
  1: "漫才",
  2: "コント",
  3: "その他",
  4: "その他",
};

const isCategoryLabel = (category?: number): category is number =>
  category !== undefined && Number.isFinite(category);

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

function mapRawVideo(video: RawVideo): VideoItem | null {
  const videoId = parseYoutubeId(video.url);
  if (!videoId) {
    return null;
  }
  const category = isCategoryLabel(video.category)
    ? categoryLabelMap[video.category] ?? "その他"
    : undefined;

  return {
    id: videoId,
    videoId,
    title: video.title,
    thumbnail: buildThumbnailUrl(videoId),
    category,
  };
}

export type FetchVideoOptions = {
  query?: string;
  category?: number;
  signal?: AbortSignal;
  mode?: "new" | "random";
  limit?: number;
};

export async function fetchVideoItems(
  fetchFn: typeof fetch,
  options?: FetchVideoOptions,
): Promise<VideoItem[]> {
  const params = new URLSearchParams();
  if (options?.query) {
    params.set("q", options.query);
  }
  if (options?.category) {
    params.set("category", String(options.category));
  }
  if (options?.mode) {
    params.set("mode", options.mode);
  }
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }

  const url = `/api/videos${params.toString() ? `?${params}` : ""}`;
  const response = await fetchFn(url, { signal: options?.signal });

  if (!response.ok) {
    throw new Error("動画情報の取得に失敗しました。");
  }

  const payload = (await response.json()) as {
    videos?: RawVideo[];
  };

  const items: VideoItem[] = [];
  for (const raw of payload.videos ?? []) {
    const mapped = mapRawVideo(raw);
    if (mapped) {
      items.push(mapped);
    }
  }

  return items;
}
