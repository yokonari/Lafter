import type { Hono } from "hono";
import type { KVNamespace } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { channels, playlists, videos } from "@/lib/schema";
import { createDatabase, type AppDatabase } from "../context";
import type { AdminEnv } from "../types";

type TransactionClient = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
type DatabaseClient = AppDatabase | TransactionClient;
type CloudflareBindings = Parameters<typeof createDatabase>[0];

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
const POSITIVE_KEYWORDS = ["ネタ", "漫才", "コント"];
const NEGATIVE_KEYWORDS = [
  "ラジオ",
  "トーク",
  "ゲーム配信",
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
  "切り抜き",
  "#切り抜き",
  "Shorts",
  "shorts",
  "MV",
  '#shorts',
  '生配信',
  'インスタライブ',
  'ミュージックビデオ',
  '踊ってみた',
];

export function registerPostVideosSync(app: Hono<AdminEnv>) {
  app.post("/videos/sync", async (c) => {
    const { env } = getCloudflareContext();
    const apiKey =
      env.YOUTUBE_API_KEY ??
      // ローカル開発時は process.env から丁寧に補完し、共有の環境変数設定を維持いたします。
      process.env.YOUTUBE_API_KEY ??
      "";
    if (!apiKey) {
      return c.json(
        { message: "YouTube API キーが設定されていません。" },
        500,
      );
    }

    const db = createDatabase(env);

    try {
      const csv = await fetchArtistsCsv(env);
      const artists = await loadArtists(csv);

      const summary = {
        artistsProcessed: artists.length,
        videosProcessed: 0,
        playlistsProcessed: 0,
        errors: [] as string[],
      };

      const ensuredChannels = new Set<string>();
      const pendingResults: Array<{
        artist: string;
        channels: { channelId: string; channelTitle: string }[];
        videos: SearchItem[];
        playlists: SearchItem[];
      }> = [];

      for (const artist of artists) {
        const query = `${artist} ネタ`;
        try {
          const searchItems = await searchVideos(query, apiKey);
          const videoItems = searchItems.filter((i) => i.idKind === "youtube#video");
          const playlistItems = searchItems.filter((i) => i.idKind === "youtube#playlist");

          const combinedChannels = [...videoItems, ...playlistItems].map((item) => ({
            channelId: item.channelId,
            channelTitle: item.channelTitle ?? "",
          }));
          const seenChannelIds = new Set<string>();
          const uniqueChannels: { channelId: string; channelTitle: string }[] = [];
          for (const entry of combinedChannels) {
            if (!entry.channelId || seenChannelIds.has(entry.channelId)) continue;
            seenChannelIds.add(entry.channelId);
            uniqueChannels.push(entry);
          }

          pendingResults.push({
            artist,
            channels: uniqueChannels,
            videos: videoItems,
            playlists: playlistItems,
          });
        } catch (error) {
          summary.errors.push(
            `${artist}: ${(error as Error)?.message ?? "検索処理に失敗しました。"}`,
          );
        }
      }

      const processPendingResults = async (
        client: DatabaseClient,
        options: { abortOnError: boolean },
      ) => {
        for (const result of pendingResults) {
          const { artist, channels, videos: videoItems, playlists: playlistItems } = result;
          const channelTitleMap = new Map<string, string>();
          for (const entry of channels) {
            if (!entry.channelId) continue;
            channelTitleMap.set(entry.channelId, entry.channelTitle ?? "");
          }

          for (const item of videoItems) {
            if (shouldSkipVideo(item.title)) continue;
            if (!item.videoId || !item.channelId) continue;
            const resolvedChannelTitle =
              channelTitleMap.get(item.channelId) ||
              item.channelTitle ||
              item.channelId ||
              "";
            if (shouldSkipChannel(resolvedChannelTitle)) continue;

            try {
              const exists = await videoExists(client, item.videoId);
              if (exists) continue;
              await ensureChannel(
                client,
                ensuredChannels,
                item.channelId,
                resolvedChannelTitle,
              );
              await insertVideo(client, {
                id: item.videoId,
                title: item.title,
                channelId: item.channelId,
                publishedAt: item.publishedAt,
              });
              summary.videosProcessed += 1;
            } catch (error) {
              if (isUniqueConstraintError(error)) {
                continue;
              }
              logSqlError(error);
              summary.errors.push(
                `${artist}: ${
                  (error as Error)?.message ?? "動画情報の保存に失敗しました。"
                }`,
              );
              if (options.abortOnError) {
                throw error;
              }
            }
          }

          for (const item of playlistItems) {
            if (!item.playlistId) continue;
            if (!item.channelId || !ensuredChannels.has(item.channelId)) continue;
            const resolvedChannelTitle =
              channelTitleMap.get(item.channelId) ||
              item.channelTitle ||
              item.channelId ||
              "";
            if (shouldSkipChannel(resolvedChannelTitle)) continue;

            try {
              const exists = await playlistExists(client, item.playlistId);
              if (exists) continue;
              await insertPlaylist(client, {
                id: item.playlistId,
                title: item.title,
                channelId: item.channelId,
              });
              summary.playlistsProcessed += 1;
            } catch (error) {
              if (isUniqueConstraintError(error)) {
                continue;
              }
              logSqlError(error);
              summary.errors.push(
                `${artist}: ${
                  (error as Error)?.message ?? "再生リスト情報の保存に失敗しました。"
                }`,
              );
              if (options.abortOnError) {
                throw error;
              }
            }
          }
        }
      };

      try {
        await db.transaction(async (tx) => {
          await processPendingResults(tx, { abortOnError: true });
        });
      } catch (error) {
        logSqlError(error);
        // トランザクション内で1件でも失敗した場合は、確保済みチャンネル集合を丁寧に初期化し直した上で非トランザクション処理へ切り替え、残りの同期を続行いたします。
        ensuredChannels.clear();
        await processPendingResults(db, { abortOnError: false });
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
}

// 以下、YouTube 検索とデータ整形に関する補助関数を丁寧にご用意いたします。

function logSqlError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const sqlText =
    typeof error === "object" && error !== null && "sql" in error
      ? String((error as { sql?: unknown }).sql)
      : undefined;
  console.error(message, sqlText);
}

// UNIQUE 制約違反かどうかを丁寧に判定し、重複挿入時の握り潰し判定に活用いたします。
function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message) || /SQLITE_CONSTRAINT/i.test(message);
}

function isKvNamespace(value: unknown): value is KVNamespace {
  return (
    typeof value === "object" &&
    value !== null &&
    "get" in value &&
    typeof (value as { get?: unknown }).get === "function"
  );
}

function resolveArtistsKv(env: CloudflareBindings): KVNamespace | null {
  const record = env as unknown as Record<string, unknown>;
  for (const key of ["lafter-artist", "LAFTER"]) {
    const value = record[key];
    if (isKvNamespace(value)) {
      return value;
    }
  }
  return null;
}

async function fetchArtistsCsv(env: CloudflareBindings): Promise<string> {
  const kv = resolveArtistsKv(env);
  if (!kv) {
    throw new Error("KV バインディング lafter-artist を取得できませんでした。");
  }
  const csv = await kv.get("artists_list", "text");
  if (!csv) {
    throw new Error("Workers KV から artists_list を読み込めませんでした。");
  }
  return csv;
}

async function loadArtists(csv: string): Promise<string[]> {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0] ?? "";
  const headerColumns = header ? splitCsvLine(header) : [];
  // ヘッダー情報から status 列の位置を丁寧に特定し、未定義の場合は従来通り全件を対象といたします。
  const statusColumnIndex = headerColumns.findIndex(
    (name) => name.trim().toLowerCase() === "status",
  );
  const rows = lines.slice(1);

  const unique = new Set<string>();
  for (const line of rows) {
    if (!line) continue;
    const cols = splitCsvLine(line);
    if (statusColumnIndex >= 0) {
      const statusValue = (cols[statusColumnIndex] ?? "").trim();
      // status 列が追加されましたので、0 の行のみ丁寧に処理対象へ含めさせていただきます。
      if (statusValue !== "0") continue;
    }
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

async function ensureChannel(
  db: DatabaseClient,
  ensured: Set<string>,
  channelId: string,
  channelTitle: string,
) {
  if (!channelId) {
    throw new Error("チャンネルIDを取得できませんでした。");
  }
  if (ensured.has(channelId)) return;
  if (!channelTitle) {
    throw new Error("チャンネル名を取得できませんでした。");
  }
  const exists = await channelExists(db, channelId);
  if (!exists) {
    try {
      await insertChannel(db, {
        id: channelId,
        name: channelTitle,
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }
  ensured.add(channelId);
}

async function channelExists(db: DatabaseClient, channelId: string): Promise<boolean> {
  const rows = await db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  return rows.length > 0;
}

async function insertChannel(
  db: DatabaseClient,
  input: {
    id: string;
    name: string;
  },
) {
  await db.insert(channels).values({
    id: input.id,
    name: input.name,
    lastChecked: new Date().toISOString(),
  });
}

async function videoExists(db: DatabaseClient, videoId: string): Promise<boolean> {
  const rows = await db
    .select({ id: videos.id })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  return rows.length > 0;
}

async function insertVideo(
  db: DatabaseClient,
  input: {
    id: string;
    title: string;
    channelId: string;
    publishedAt?: string;
  },
) {
  await db.insert(videos).values({
    id: input.id,
    title: input.title,
    channelId: input.channelId,
    publishedAt: input.publishedAt ?? null,
    category: 0,
    status: 0,
    lastCheckedAt: new Date().toISOString(),
  });
}

async function insertPlaylist(
  db: DatabaseClient,
  input: { id: string; title: string; channelId: string },
) {
  await db.insert(playlists).values({
    id: input.id,
    channelId: input.channelId,
    name: input.title,
    lastChecked: new Date().toISOString(),
  });
}

function shouldSkipVideo(title: string): boolean {
  const normalized = title.toLowerCase();
  const hasPositive = POSITIVE_KEYWORDS.some((w) => normalized.includes(w.toLowerCase()));
  const hasNegative = NEGATIVE_KEYWORDS.some((w) => normalized.includes(w.toLowerCase()));
  return !hasPositive && hasNegative;
}

async function playlistExists(db: DatabaseClient, playlistId: string): Promise<boolean> {
  const rows = await db
    .select({ id: playlists.id })
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .limit(1);
  return rows.length > 0;
}

function shouldSkipChannel(name: string): boolean {
  const normalized = name.toLowerCase();
  const hasPositive = POSITIVE_KEYWORDS.some((w) => normalized.includes(w.toLowerCase()));
  const hasNegative = NEGATIVE_KEYWORDS.some((w) => normalized.includes(w.toLowerCase()));
  return !hasPositive && hasNegative;
}
