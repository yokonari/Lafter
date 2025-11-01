// src/app/edge/videos/sync/route.ts
import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export interface Env {
  lafter_db: D1Database;
  YOUTUBE_API_KEY?: string;
}

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
  snippet?: { channelId?: string; channelTitle?: string; publishedAt?: string; title?: string };
};

type SearchAPIResponse = { items?: SearchResponseItem[] };

const SEARCH_BASE_URL = "https://www.googleapis.com/youtube/v3/search";
const DEFAULT_MAX_RESULTS = 50;
const POSITIVE_VIDEO_KEYWORDS = ["ネタ", "漫才", "コント"];
const NEGATIVE_VIDEO_KEYWORDS = [
  "ラジオ", "トーク", "ゲーム配信", "♯", "実況", "インタビュー",
  "広告", "睡眠用", "作業用", "高音質", "BGM", "聞き流し", "まとめ", "タイムスタンプ",
];

export async function POST(request: Request, context: unknown) {
  const env = (context as { env?: Env } | null | undefined)?.env;
  const db = env?.lafter_db;
  if (!db) {
    return NextResponse.json({ message: "D1 データベースに接続できません。" }, { status: 500 });
  }

  const apiKey = env?.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: "YouTube API キーが設定されていません。" }, { status: 500 });
  }

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
            id: item.videoId!, title: item.title, channelId: item.channelId,
            publishedAt: item.publishedAt, duration: "PT0S",
          });
          summary.videosProcessed += 1;
        }

        for (const item of playlistItems) {
          await upsertPlaylist(db, { id: item.playlistId!, title: item.title, channelId: item.channelId });
          summary.playlistsProcessed += 1;
        }
      } catch (e) {
        summary.errors.push(`${artist}: ${(e as Error)?.message ?? "処理に失敗しました。"}`);
      }
    }

    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: "動画情報の取得中に予期せぬエラーが発生しました。", detail: (error as Error).message },
      { status: 500 },
    );
  }
}

/* =========================
 * Helpers
 * =======================*/

async function loadArtists(request: Request): Promise<string[]> {
  // public/data/artists_list.csv を fetch で取得（Edge対応）
  const csvUrl = new URL("/data/artists_list.csv", request.url);
  const res = await fetch(csvUrl.toString());
  if (!res.ok) throw new Error("artists_list.csv を読み込めませんでした。");
  const csv = await res.text();

  const lines = csv.trim().split(/\r?\n/);
  const rows = lines.slice(1); // 1行目ヘッダー想定

  const unique = new Set<string>();
  for (const line of rows) {
    if (!line) continue;
    const cols = splitCsvLine(line);
    const artistRaw = (cols[1] ?? "").trim(); // 2列目＝出演者（必要なら調整）
    if (!artistRaw) continue;

    for (const name of expandArtistNames(artistRaw)) {
      if (name && name !== "–") unique.add(name);
    }
  }
  return Array.from(unique);
}

// ダブルクオート対応の CSV 1 行分割
function splitCsvLine(line: string): string[] {
  const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g);
  return cols.map((s) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s));
}

// かっこ内（全角/半角）を除去し、各種区切りで分割
function expandArtistNames(raw: string): string[] {
  const noParens = raw.replace(/\s*\([^)]*\)/g, "").replace(/\s*（[^）]*）/g, "");
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
  if (!response.ok) throw new Error(`YouTube Search API の呼び出しに失敗 (${response.status}).`);
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
        : false
    );
}

async function upsertVideo(
  db: D1Database,
  input: { id: string; title: string; channelId: string; publishedAt?: string; duration: string },
) {
  const durationSec = toSeconds(input.duration);
  const lastCheckedAt = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO videos (id, title, channel_id, published_at, duration_sec, category, last_checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         channel_id = excluded.channel_id,
         published_at = excluded.published_at,
         duration_sec = excluded.duration_sec,
         category = excluded.category,
         last_checked_at = excluded.last_checked_at`,
    )
    .bind(input.id, input.title, input.channelId, input.publishedAt ?? null, durationSec, 0, lastCheckedAt)
    .run();
}

async function upsertPlaylist(db: D1Database, input: { id: string; title: string; channelId: string }) {
  const lastCheckedAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO playlists (id, channel_id, name, is_included, status, last_checked)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         channel_id = excluded.channel_id,
         name = excluded.name,
         last_checked = excluded.last_checked`,
    )
    .bind(input.id, input.channelId, input.title, 0, 0, lastCheckedAt)
    .run();
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
