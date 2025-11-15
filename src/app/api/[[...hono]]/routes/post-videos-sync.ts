import type { Hono } from "hono";
import type { KVNamespace } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { channels, playlists, videos } from "@/lib/schema";
import { NEGATIVE_KEYWORDS } from "@/lib/video-keywords";
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
  topVideoId?: string | null;
};

type SearchResponseItem = {
  id?: { kind?: string; videoId?: string; playlistId?: string };
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    title?: string;
    thumbnails?: {
      default?: {
        url?: string;
      };
    };
  };
};

type SearchAPIResponse = { items?: SearchResponseItem[] };
type SearchApiError = Error & { status?: number };

const SEARCH_BASE_URL = "https://www.googleapis.com/youtube/v3/search";
const DEFAULT_MAX_RESULTS = 30;

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

    const targetIndexParam = c.req.query("index");
    let targetIndex: number | undefined;
    if (targetIndexParam !== undefined) {
      const parsed = Number(targetIndexParam);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return c.json({ message: "index は 0 以上の整数で指定してください。" }, 400);
      }
      targetIndex = parsed;
    }

    const manualArtistInputs: string[] = [];
    const artistQueryParam = c.req.query("artist");
    if (artistQueryParam) {
      manualArtistInputs.push(
        ...artistQueryParam
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      );
    }

    let requestJsonBody: unknown = null;
    const contentType = c.req.header("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        requestJsonBody = await c.req.json();
      } catch {
        requestJsonBody = null;
      }
    }
    if (requestJsonBody && typeof requestJsonBody === "object") {
      const bodyObject = requestJsonBody as {
        artist?: unknown;
        artists?: unknown;
      };
      if (typeof bodyObject.artist === "string") {
        manualArtistInputs.push(bodyObject.artist);
      } else if (Array.isArray(bodyObject.artist)) {
        for (const entry of bodyObject.artist) {
          if (typeof entry === "string") {
            manualArtistInputs.push(entry);
          }
        }
      }
      if (Array.isArray(bodyObject.artists)) {
        for (const entry of bodyObject.artists) {
          if (typeof entry === "string") {
            manualArtistInputs.push(entry);
          }
        }
      } else if (typeof bodyObject.artists === "string") {
        manualArtistInputs.push(bodyObject.artists);
      }
    }
    const manualArtists = normalizeArtistInputs(manualArtistInputs);

    try {
      let artists: string[] = [];
      if (manualArtists.length > 0) {
        artists = manualArtists;
      } else {
        const csv = await fetchArtistsCsv(env);
        artists = await loadArtists(csv, { targetIndex });
        if (typeof targetIndex === "number" && artists.length === 0) {
          return c.json(
            { message: `index ${targetIndex} に該当する処理対象が見つかりませんでした。` },
            404,
          );
        }
      }

      const maxArtists = 50;
      const limitedArtists = artists.slice(0, maxArtists);

      if (artists.length > maxArtists) {
        console.warn(
          `[videos/sync] 処理対象が ${artists.length} 件あったため、先頭 ${maxArtists} 件に制限しました。`
        );
      }

      const summary = {
        artistsProcessed: limitedArtists.length,
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

      let hadForbiddenSearchError = false;
      for (const artist of limitedArtists) {
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
          const message = (error as Error)?.message ?? "検索処理に失敗しました。";
          summary.errors.push(`${artist}: ${message}`);
          if (isForbiddenSearchError(error)) {
            hadForbiddenSearchError = true;
          }
        }
      }

      if (hadForbiddenSearchError) {
        return c.json(
          {
            ...summary,
            message: "YouTube Search API から 403 応答があったため同期を中断しました。",
          },
          502,
        );
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
                topVideoId: item.topVideoId ?? null,
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

function extractVideoIdFromThumbnailUrl(url?: string): string | null {
  if (!url) {
    return null;
  }
  const match = url.match(/\/vi\/([^/]+)\//);
  return match ? match[1] : null;
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

function isForbiddenSearchError(error: unknown): boolean {
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as SearchApiError).status)
      : undefined;
  if (status === 403) {
    return true;
  }
  if (error instanceof Error) {
    return /\b403\b/.test(error.message);
  }
  return false;
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

async function loadArtists(
  csv: string,
  options?: { targetIndex?: number },
): Promise<string[]> {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];

  const header = lines[0] ?? "";
  const headerColumns = header ? splitCsvLine(header) : [];

  const toIndex = (name: string) => name.trim().toLowerCase();
  const statusColumnIndex = headerColumns.findIndex(
    (name) => toIndex(name) === "status",
  );
  const csvIndexColumnIndex = headerColumns.findIndex(
    (name) => toIndex(name) === "index",
  );
  const artistColumnIndex = headerColumns.findIndex(
    (name) => toIndex(name) === "artist",
  );

  const rows = lines.slice(1);
  const unique = new Set<string>();

  for (const [rowOffset, line] of rows.entries()) {
    if (!line) continue;
    const cols = splitCsvLine(line);

    if (options?.targetIndex !== undefined) {
      const indexValue =
        csvIndexColumnIndex >= 0
          ? (cols[csvIndexColumnIndex] ?? "").trim()
          : String(rowOffset);
      const numericIndex = Number(indexValue);
      if (!Number.isInteger(numericIndex) || numericIndex !== options.targetIndex) {
        continue;
      }
    }

    if (statusColumnIndex >= 0) {
      const statusValue = (cols[statusColumnIndex] ?? "").trim();
      // status 列が追加されましたので、0 の行のみ丁寧に処理対象へ含めさせていただきます。
      if (statusValue !== "0") {
        continue;
      }
    }

    const artistColumn =
      artistColumnIndex >= 0 ? artistColumnIndex : 1;
    const artistRaw = (cols[artistColumn] ?? "").trim();
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

function normalizeArtistInputs(inputs: string[]): string[] {
  const unique = new Set<string>();
  for (const raw of inputs) {
    if (!raw) continue;
    for (const name of expandArtistNames(raw)) {
      if (name && name !== "–") {
        unique.add(name);
      }
    }
  }
  return Array.from(unique);
}

async function searchVideos(query: string, apiKey: string): Promise<SearchItem[]> {
  const url = new URL(SEARCH_BASE_URL);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("maxResults", DEFAULT_MAX_RESULTS.toString());
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video,playlist");
  url.searchParams.set("safeSearch", "none");
  url.searchParams.set("regionCode", "JP");
  url.searchParams.set("relevanceLanguage", "ja");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    // 呼び出し元で HTTP ステータスを丁寧に判定できるよう、状態コードを保持して投げ直します。
    const error = new Error(
      `YouTube Search API の呼び出しに失敗 (${response.status}).`,
    ) as SearchApiError;
    error.status = response.status;
    throw error;
  }
  const data = (await response.json()) as SearchAPIResponse;
  const items = Array.isArray(data.items) ? data.items : [];

  return items
    .map((item) => {
      const thumbnailUrl = item.snippet?.thumbnails?.default?.url;
      return {
        idKind: item.id?.kind ?? "",
        videoId: item.id?.videoId ?? "",
        playlistId: item.id?.playlistId ?? "",
        channelId: item.snippet?.channelId ?? "",
        channelTitle: item.snippet?.channelTitle ?? "",
        publishedAt: item.snippet?.publishedAt ?? undefined,
        title: item.snippet?.title ?? "",
        topVideoId: extractVideoIdFromThumbnailUrl(thumbnailUrl),
      };
    })
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
    status: 0,
    lastCheckedAt: new Date().toISOString(),
  });
}

async function insertPlaylist(
  db: DatabaseClient,
  input: { id: string; title: string; channelId: string; topVideoId?: string | null },
) {
  await db.insert(playlists).values({
    id: input.id,
    channelId: input.channelId,
    name: input.title,
    topVideoId: input.topVideoId ?? null,
    lastChecked: new Date().toISOString(),
  });
}

function shouldSkipVideo(title: string): boolean {
  const normalized = title.toLowerCase();
  const hasNegative = NEGATIVE_KEYWORDS.some((w) => normalized.includes(w.toLowerCase()));
  // NGワードが含まれている場合は、OKワードの有無に関係なく即座に除外します。
  if (hasNegative) {
    return true;
  }
  return false;
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
  const hasNegative = NEGATIVE_KEYWORDS.some((w) => normalized.includes(w.toLowerCase()));
  // NGワードを含むチャンネルは安全側で必ず除外します。
  if (hasNegative) {
    return true;
  }
  return false;
}
