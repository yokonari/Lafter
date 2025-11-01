import { NextResponse } from "next/server";
import path from "node:path";
import { readFile } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type D1Database = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<{ success: boolean; error?: string }>;
    };
  };
};

export interface Env {
  // If you set another name in the Wrangler config file for the value for 'binding',
  // replace "DB" with the variable name you defined.
  lafter_db: D1Database;
}

// type Env = {
//   lafter_db: D1Database;
//   YOUTUBE_API_KEY?: string;
// };

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
  id?: {
    kind?: string;
    videoId?: string;
    playlistId?: string;
  };
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    title?: string;
  };
};

const ARTIST_FILE_PATH = path.join(process.cwd(), "data", "artists_list.csv");
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

export async function POST(
  _request: Request,
  context: unknown,
): Promise<NextResponse> {
  const env = (context as { env?: Env } | null | undefined)?.env;
  if (!env?.lafter_db) {
    return NextResponse.json(
      { message: "D1 データベースに接続できません。" },
      { status: 500 },
    );
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { message: "YouTube API キーが設定されていません。" },
      { status: 500 },
    );
  }

  try {
    const artists = await loadArtists();
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
        const videoItems = searchItems.filter(
          (item) => item.idKind === "youtube#video",
        );
        const playlistItems = searchItems.filter(
          (item) => item.idKind === "youtube#playlist",
        );

        if (videoItems.length === 0 && playlistItems.length === 0) {
          continue;
        }

        for (const item of videoItems) {
          if (shouldSkipVideo(item.title)) {
            continue;
          }

          await upsertVideo(env.lafter_db, {
            id: item.videoId!,
            title: item.title,
            channelId: item.channelId,
            publishedAt: item.publishedAt,
            duration: "PT0S",
          });

          summary.videosProcessed += 1;
        }

        for (const item of playlistItems) {
          await upsertPlaylist(env.lafter_db, {
            id: item.playlistId!,
            title: item.title,
            channelId: item.channelId,
          });

          summary.playlistsProcessed += 1;
        }
      } catch (artistError) {
        summary.errors.push(
          `${artist}: ${(artistError as Error).message ?? "処理に失敗しました。"}`,
        );
      }
    }

    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message: "動画情報の取得中に予期せぬエラーが発生しました。",
        detail: (error as Error).message,
      },
      { status: 500 },
    );
  }
}

async function loadArtists(): Promise<string[]> {
  // この関数では CSV から芸人名を丁寧に読み込み、（）内情報を除外しつつ / で分割した個別名を集約します。
  const csv = await readFile(ARTIST_FILE_PATH, "utf8");
  const [, ...rows] = csv.split(/\r?\n/);
  const unique = new Set<string>();

  for (const line of rows) {
    const [, artistRaw] = line.split(",");
    const sanitizedNames = expandArtistNames(artistRaw?.trim() ?? "");
    for (const name of sanitizedNames) {
      if (name === "" || name === "–" || unique.has(name)) {
        continue;
      }
      unique.add(name);
    }
  }

  return Array.from(unique);
}

async function searchVideos(
  query: string,
  apiKey: string,
): Promise<SearchItem[]> {
  // この関数では YouTube Search API を丁寧に呼び出し、動画候補の基本情報だけを抽出します。
  const url = new URL(SEARCH_BASE_URL);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("order", "relevance");
  url.searchParams.set("maxResults", DEFAULT_MAX_RESULTS.toString());
  url.searchParams.set("q", query);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`YouTube Search API の呼び出しに失敗しました (${response.status}).`);
  }

  const data = await response.json();
  return (data.items ?? [])
    .filter(
      (item: unknown): item is SearchResponseItem =>
        typeof item === "object" && item !== null,
    )
    .map((item: SearchResponseItem) => ({
      idKind: item.id?.kind ?? "",
      videoId: item.id?.videoId ?? "",
      playlistId: item.id?.playlistId ?? "",
      channelId: item.snippet?.channelId ?? "",
      channelTitle: item.snippet?.channelTitle ?? "",
      publishedAt: item.snippet?.publishedAt ?? undefined,
      title: item.snippet?.title ?? "",
    }))
    .filter((item: SearchItem) => {
      if (item.idKind === "youtube#video") {
        return Boolean(item.videoId && item.channelId && item.title);
      }
      if (item.idKind === "youtube#playlist") {
        return Boolean(item.playlistId && item.channelId && item.title);
      }
      return false;
    });
}

async function upsertVideo(
  db: D1Database,
  input: {
    id: string;
    title: string;
    channelId: string;
    publishedAt?: string;
    duration: string;
  },
) {
  // この関数では 動画のメタデータを丁寧に整形し、videos テーブルへ保存します。
  const durationSec = toSeconds(input.duration);
  const lastCheckedAt = new Date().toISOString();

  await db
    .prepare(
      `
        INSERT INTO videos (id, title, channel_id, published_at, duration_sec, category, last_checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          channel_id = excluded.channel_id,
          published_at = excluded.published_at,
          duration_sec = excluded.duration_sec,
          category = excluded.category,
          last_checked_at = excluded.last_checked_at
      `,
    )
    .bind(
      input.id,
      input.title,
      input.channelId,
      input.publishedAt ?? null,
      durationSec,
      0,
      lastCheckedAt,
    )
    .run();
}

async function upsertPlaylist(
  db: D1Database,
  input: {
    id: string;
    title: string;
    channelId: string;
  },
) {
  // この関数では プレイリストのメタデータを丁寧に整形し、playlists テーブルへ保存します。
  const lastCheckedAt = new Date().toISOString();

  await db
    .prepare(
      `
        INSERT INTO playlists (id, channel_id, name, is_included, status, last_checked)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          channel_id = excluded.channel_id,
          name = excluded.name,
          last_checked = excluded.last_checked
      `,
    )
    .bind(input.id, input.channelId, input.title, 0, 0, lastCheckedAt)
    .run();
}

function shouldSkipVideo(title: string): boolean {
  // この関数では タイトルの含有語を丁寧に判定し、条件に合わない動画を除外します。
  const hasPositive = POSITIVE_VIDEO_KEYWORDS.some((word) =>
    title.includes(word),
  );
  const hasNegative = NEGATIVE_VIDEO_KEYWORDS.some((word) =>
    title.includes(word),
  );
  return !hasPositive && hasNegative;
}

function expandArtistNames(raw: string): string[] {
  // この関数では / で区切られた芸人名を丁寧に分割し、（）内の補足情報を除去します。
  return raw
    .split("/")
    .map((part) =>
      part
        .replace(/\s*\([^)]*\)/g, "")
        .replace(/\s*（[^）]*）/g, "")
        .trim(),
    )
    .filter((name) => name !== "");
}

function toSeconds(isoDuration: string): number {
  // この関数では ISO 8601 形式の再生時間を丁寧に秒数へ変換します。
  const pattern = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const match = pattern.exec(isoDuration);
  if (!match) {
    return 0;
  }

  const [, hours, minutes, seconds] = match;
  const hourValue = hours ? Number(hours) * 3600 : 0;
  const minuteValue = minutes ? Number(minutes) * 60 : 0;
  const secondValue = seconds ? Number(seconds) : 0;
  return hourValue + minuteValue + secondValue;
}
