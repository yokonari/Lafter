import { playlists, videos } from "@/lib/schema";
import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Cloudflare 環境の DB バインディングを型として明示させていただきます。
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    YOUTUBE_API_KEY?: string;
  }
}

type AppDatabase = ReturnType<typeof drizzle>;

type SearchItem = {
  idKind: string;
  videoId?: string;
  playlistId?: string;
  channelId: string;
  channelTitle: string;
  publishedAt?: string;
  title: string;
};

type SearchResponseItem = {
  id?: { kind?: string; videoId?: string; playlistId?: string };
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    title?: string;
  };
};

type SearchAPIResponse = { items?: SearchResponseItem[] };

const SEARCH_BASE_URL = "https://www.googleapis.com/youtube/v3/search";
const DEFAULT_MAX_RESULTS = 50;
const POSITIVE_VIDEO_KEYWORDS = ["ネタ", "漫才", "コント"];
const NEGATIVE_VIDEO_KEYWORDS = [
  "ラジオ",
  "トーク",
  "ゲーム配信",
  "♯",
  "実況",
  "インタビュー",
  "広告",
  "睡眠用",
  "作業用",
  "高音質",
  "BGM",
  "聞き流し",
  "まとめ",
  "タイムスタンプ",
];

const app = new Hono().basePath("/api");

app.get("/videos", async (c) => {
  const { env } = getCloudflareContext();
  // 型定義済みの env から安全に DB インスタンスを取得いたします。
  const db = drizzle(env.DB);
  const filesResponse = await db.select().from(videos);
  return c.json(filesResponse);
});

app.post("/videos/sync", async (c) => {
  const request = c.req.raw;
  const { env } = getCloudflareContext();
  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return c.json(
      { message: "YouTube API キーが設定されていません。" },
      500,
    );
  }

  const db = drizzle(env.DB);

  try {
    const artists = await loadArtists(request);

    const summary = {
      artistsProcessed: artists.length,
      videosProcessed: 0,
      playlistsProcessed: 0,
      errors: [] as string[],
    };

    for (const artist of artists) {
      const query = `${artist} ネタ`;
      try {
        const searchItems = await searchVideos(query, apiKey);
        const videoItems = searchItems.filter((i) => i.idKind === "youtube#video");
        const playlistItems = searchItems.filter((i) => i.idKind === "youtube#playlist");

        for (const item of videoItems) {
          if (shouldSkipVideo(item.title)) continue;
          await upsertVideo(db, {
            id: item.videoId!,
            title: item.title,
            channelId: item.channelId,
            publishedAt: item.publishedAt,
            duration: "PT0S",
          });
          summary.videosProcessed += 1;
        }

        for (const item of playlistItems) {
          await upsertPlaylist(db, {
            id: item.playlistId!,
            title: item.title,
            channelId: item.channelId,
          });
          summary.playlistsProcessed += 1;
        }
      } catch (error) {
        summary.errors.push(
          `${artist}: ${(error as Error)?.message ?? "処理に失敗しました。"}`,
        );
      }
    }

    return c.json(summary, 200);
  } catch (error) {
    return c.json(
      {
        message: "動画情報の取得中に予期せぬエラーが発生しました。",
        detail: (error as Error).message,
      },
      500,
    );
  }
});

// 以下、YouTube 検索とデータ整形に関する補助関数を丁寧にご用意いたします。

async function loadArtists(request: Request): Promise<string[]> {
  // Edge 環境でも安定して参照できる CSV を fetch で読み込ませていただきます。
  const csvUrl = new URL("/data/artists_list.csv", request.url);
  const res = await fetch(csvUrl.toString());
  if (!res.ok) {
    throw new Error("artists_list.csv を読み込めませんでした。");
  }
  const csv = await res.text();

  const lines = csv.trim().split(/\r?\n/);
  const rows = lines.slice(1);

  const unique = new Set<string>();
  for (const line of rows) {
    if (!line) continue;
    const cols = splitCsvLine(line);
    const artistRaw = (cols[1] ?? "").trim();
    if (!artistRaw) continue;

    for (const name of expandArtistNames(artistRaw)) {
      if (name && name !== "–") unique.add(name);
    }
  }
  return Array.from(unique);
}

function splitCsvLine(line: string): string[] {
  const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g);
  return cols.map((s) =>
    s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s,
  );
}

function expandArtistNames(raw: string): string[] {
  const noParens = raw
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*（[^）]*）/g, "");
  return noParens
    .split(/[\/／・、&＆]|(?<=\S)と(?=\S)/g)
    .map((s) => s.normalize("NFKC").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

async function searchVideos(query: string, apiKey: string): Promise<SearchItem[]> {
  const url = new URL(SEARCH_BASE_URL);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("order", "relevance");
  url.searchParams.set("maxResults", DEFAULT_MAX_RESULTS.toString());
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video,playlist");
  url.searchParams.set("safeSearch", "none");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`YouTube Search API の呼び出しに失敗 (${response.status}).`);
  }
  const data = (await response.json()) as SearchAPIResponse;
  const items = Array.isArray(data.items) ? data.items : [];

  return items
    .map((item) => ({
      idKind: item.id?.kind ?? "",
      videoId: item.id?.videoId ?? "",
      playlistId: item.id?.playlistId ?? "",
      channelId: item.snippet?.channelId ?? "",
      channelTitle: item.snippet?.channelTitle ?? "",
      publishedAt: item.snippet?.publishedAt ?? undefined,
      title: item.snippet?.title ?? "",
    }))
    .filter((it) =>
      it.idKind === "youtube#video"
        ? Boolean(it.videoId && it.channelId && it.title)
        : it.idKind === "youtube#playlist"
          ? Boolean(it.playlistId && it.channelId && it.title)
          : false,
    );
}

async function upsertVideo(
  db: AppDatabase,
  input: {
    id: string;
    title: string;
    channelId: string;
    publishedAt?: string;
    duration: string;
  },
) {
  const durationSec = toSeconds(input.duration);
  // Drizzle の upsert で動画情報を丁寧に更新・挿入いたします。
  await db
    .insert(videos)
    .values({
      id: input.id,
      title: input.title,
      channelId: input.channelId,
      publishedAt: input.publishedAt ?? null,
      category: 0,
    })
    .onConflictDoUpdate({
      target: videos.id,
      set: {
        title: input.title,
        channelId: input.channelId,
        publishedAt: input.publishedAt ?? null,
        category: 0,
      },
    });
}

async function upsertPlaylist(
  db: AppDatabase,
  input: { id: string; title: string; channelId: string },
) {
  await db
    .insert(playlists)
    .values({
      id: input.id,
      channelId: input.channelId,
      name: input.title,
      lastChecked: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: playlists.id,
      set: {
        channelId: input.channelId,
        name: input.title,
        lastChecked: new Date().toISOString(),
      },
    });
}

function shouldSkipVideo(title: string): boolean {
  const hasPositive = POSITIVE_VIDEO_KEYWORDS.some((w) => title.includes(w));
  const hasNegative = NEGATIVE_VIDEO_KEYWORDS.some((w) => title.includes(w));
  return !hasPositive && hasNegative;
}

function toSeconds(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!m) return 0;
  const [, H, M, S] = m;
  return (H ? +H * 3600 : 0) + (M ? +M * 60 : 0) + (S ? +S : 0);
}

export const GET = handle(app);
export const POST = handle(app);
