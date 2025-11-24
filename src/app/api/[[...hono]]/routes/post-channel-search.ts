import type { Hono, Context } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { channels, playlists, videos } from "@/lib/schema";
import { NEGATIVE_KEYWORDS, POSITIVE_KEYWORDS } from "@/lib/video-keywords";
import { createDatabase, type AppDatabase } from "../context";
import { autoCategorizeVideos } from "./post-videos-auto-categorize";

type TransactionClient = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
type DatabaseClient = AppDatabase | TransactionClient;

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

type SearchAPIResponse = {
  items?: SearchResponseItem[];
  nextPageToken?: string;
};
type SearchApiError = Error & { status?: number };

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

const SEARCH_BASE_URL = "https://www.googleapis.com/youtube/v3/search";
const MAX_RESULTS_PER_PAGE = 50;

export function registerPostChannelSearch<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string,
>(app: Hono<E, S, B>) {
  // セッション不要で API シークレットのみ検証する一般ルートとして登録します。
  const handler = async (c: Context) => {
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

    // チャンネルIDの受け取りはクエリ・JSON双方に配慮し、柔軟に対応いたします。
    let channelId = (c.req.query("channelId") ?? "").trim();
    let isFullSearch = parseBooleanInput(c.req.query("isFullSearch"));
    let publishedAfter = (c.req.query("publishedAfter") ?? "").trim();

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
      const body = requestJsonBody as { channelId?: unknown; isFullSearch?: unknown; publishedAfter?: unknown };
      if (!channelId && typeof body.channelId === "string") {
        channelId = body.channelId.trim();
      }
      if (isFullSearch === null) {
        isFullSearch = parseBooleanInput(body.isFullSearch);
      }
      if (!publishedAfter && typeof body.publishedAfter === "string") {
        publishedAfter = body.publishedAfter.trim();
      }
    }

    if (!channelId) {
      return c.json({ message: "channelId を指定してください。" }, 400);
    }
    const fullSearchFlag = isFullSearch ?? false;
    // チャンネル検索の開始を丁寧にログへ残し、実行条件を把握しやすくします。
    console.log(`[channel-search] チャンネル ${channelId} の検索を開始します (fullSearch=${fullSearchFlag}, publishedAfter=${publishedAfter || "なし"})`);

    try {
      // チャンネルに紐づく動画・再生リストを指定件数ずつ丁寧に収集します。
      const searchItems = await searchChannelItems(channelId, apiKey, {
        isFullSearch: fullSearchFlag,
        publishedAfter: publishedAfter || undefined,
      });
      const videoItems = searchItems.filter((i) => i.idKind === "youtube#video");
      const playlistItems = searchItems.filter((i) => i.idKind === "youtube#playlist");
      // 取得件数をこまめに記録し、API 側の挙動を追跡しやすくします。
      console.log(
        `[channel-search] 取得結果 チャンネル=${channelId} 動画=${videoItems.length}件 再生リスト=${playlistItems.length}件 合計=${searchItems.length}件`,
      );

      const ensuredChannels = new Set<string>();
      const summary = {
        channelId,
        isFullSearch: fullSearchFlag,
        fetched: searchItems.length,
        videosInserted: 0,
        playlistsInserted: 0,
        // サーチAPIで取得した動画タイトルをすべて返し、結果の確認をしやすくします。
        videoTitles: videoItems.map((v) => v.title),
        errors: [] as string[],
      };

      // チャンネル名の候補は最初に得られた要素から丁寧に抽出します。
      const channelTitleFallback =
        videoItems[0]?.channelTitle ||
        playlistItems[0]?.channelTitle ||
        channelId;

      // 検索APIを呼んだ時点でチャンネルの最終確認時刻を必ず更新し、存在しない場合は作成します。
      try {
        await ensureChannel(db, ensuredChannels, channelId, channelTitleFallback);
      } catch (error) {
        summary.errors.push(
          `channel ${channelId}: ${(error as Error)?.message ?? "チャンネル情報の更新に失敗しました。"
          }`,
        );
      }

      for (const item of videoItems) {
        if (!item.videoId || !item.channelId) continue;
        const resolvedTitle = item.channelTitle || channelTitleFallback;
        if (shouldSkipChannel(resolvedTitle ?? "")) continue;
        if (shouldSkipVideo(item.title)) continue;

        try {
          const exists = await videoExists(db, item.videoId);
          if (exists) continue;
          await ensureChannel(db, ensuredChannels, item.channelId, resolvedTitle);
          await insertVideo(db, {
            id: item.videoId,
            title: item.title,
            channelId: item.channelId,
            publishedAt: item.publishedAt,
          });
          summary.videosInserted += 1;
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            continue;
          }
          logSqlError(error);
          summary.errors.push(
            `video ${item.videoId}: ${(error as Error)?.message ?? "動画情報の保存に失敗しました。"
            }`,
          );
        }
      }
      console.log(`[channel-search] 動画登録 success count=${summary.videosInserted}`);

      for (const item of playlistItems) {
        if (!item.playlistId || !item.channelId) continue;
        const resolvedTitle = item.channelTitle || channelTitleFallback;
        if (shouldSkipChannel(resolvedTitle ?? "")) continue;

        try {
          const existing = await getPlaylist(db, item.playlistId);
          if (!existing) {
            await ensureChannel(db, ensuredChannels, item.channelId, resolvedTitle);
            await insertPlaylist(db, {
              id: item.playlistId,
              title: item.title,
              channelId: item.channelId,
              topVideoId: item.topVideoId ?? null,
            });
            summary.playlistsInserted += 1;
          } else {
            // 名前かトップ動画が変わっていたら更新します
            if (existing.name !== item.title || existing.topVideoId !== item.topVideoId) {
              await updatePlaylist(db, item.playlistId, {
                name: item.title,
                topVideoId: item.topVideoId ?? null,
              });
            }
          }
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            continue;
          }
          logSqlError(error);
          summary.errors.push(
            `playlist ${item.playlistId}: ${(error as Error)?.message ?? "再生リスト情報の保存に失敗しました。"
            }`,
          );
        }
      }
      console.log(`[channel-search] 再生リスト登録 success count=${summary.playlistsInserted}`);

      // 保存直後に該当チャンネルの動画だけを丁寧に自動分類し、分類漏れを防ぎます。
      try {
        await autoCategorizeVideos(db, { limit: 0, channelId });
        console.log(`[channel-search] 自動分類を完了しました channel=${channelId}`);
      } catch (error) {
        summary.errors.push(
          `auto-categorize: ${(error as Error)?.message ?? "自動分類の実行に失敗しました。"
          }`,
        );
      }

      return c.json(summary, 200);
    } catch (error) {
      const status = (error as SearchApiError).status;
      const message = (error as Error)?.message ?? "検索処理に失敗しました。";
      if (status === 403) {
        return c.json(
          { message: "YouTube Search API から 403 応答がありました。", detail: message },
          502,
        );
      }
      return c.json(
        { message: "検索処理中にエラーが発生しました。", detail: message },
        500,
      );
    }
  };

  app.post("/channels/search", handler);
}

async function searchChannelItems(
  channelId: string,
  apiKey: string,
  options: { isFullSearch: boolean; publishedAfter?: string },
): Promise<SearchItem[]> {
  const items: SearchItem[] = [];
  let pageToken: string | undefined;
  let hasMore = true;

  // 追加取得が必要な場合に nextPageToken を繰り返し使い回します。
  while (hasMore) {
    const url = new URL(SEARCH_BASE_URL);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video,playlist");
    url.searchParams.set("channelId", channelId);
    url.searchParams.set("q", "ネタ");
    url.searchParams.set("maxResults", String(MAX_RESULTS_PER_PAGE));
    url.searchParams.set("safeSearch", "none");
    url.searchParams.set("regionCode", "JP");
    url.searchParams.set("relevanceLanguage", "ja");
    url.searchParams.set("key", apiKey);
    if (options.publishedAfter) {
      url.searchParams.set("publishedAfter", options.publishedAfter);
    }
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

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
    const responseItems = Array.isArray(data.items) ? data.items : [];

    items.push(
      ...responseItems
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
        ),
    );

    pageToken = options.isFullSearch ? data.nextPageToken : undefined;
    hasMore = Boolean(options.isFullSearch && pageToken);
  }

  return items;
}

function parseBooleanInput(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return null;
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

function logSqlError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const sqlText =
    typeof error === "object" && error !== null && "sql" in error
      ? String((error as { sql?: unknown }).sql)
      : undefined;
  console.error(message, sqlText);
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

  const existing = await getChannel(db, channelId);

  if (!existing) {
    if (!channelTitle) {
      throw new Error("チャンネル名を取得できませんでした。");
    }
    try {
      await insertChannel(db, {
        id: channelId,
        name: channelTitle || channelId,
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  } else {
    // 名前が変わっていなくても、最終確認時刻は必ず更新します
    await updateChannel(db, channelId, {
      name: (channelTitle && existing.name !== channelTitle) ? channelTitle : existing.name
    });
  }
  ensured.add(channelId);
}

async function getChannel(db: DatabaseClient, channelId: string) {
  const rows = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  return rows[0];
}

async function updateChannel(db: DatabaseClient, id: string, input: { name: string }) {
  await db
    .update(channels)
    .set({
      name: input.name,
      lastCheckedAt: new Date().toISOString(),
    })
    .where(eq(channels.id, id));
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
    // チャンネルの最終確認時刻を新カラムへ丁寧に記録します。
    lastCheckedAt: new Date().toISOString(),
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

async function getPlaylist(db: DatabaseClient, playlistId: string) {
  const rows = await db
    .select()
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .limit(1);
  return rows[0];
}

async function updatePlaylist(
  db: DatabaseClient,
  id: string,
  input: { name: string; topVideoId: string | null }
) {
  await db
    .update(playlists)
    .set({
      name: input.name,
      topVideoId: input.topVideoId,
      lastCheckedAt: new Date().toISOString(),
    })
    .where(eq(playlists.id, id));
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
    // プレイリストの最終確認日時を新しいカラムへ丁寧に保持します。
    lastCheckedAt: new Date().toISOString(),
  });
}

function shouldSkipVideo(title: string): boolean {
  const normalized = title.toLowerCase();
  const hasNegative = NEGATIVE_KEYWORDS.some((w) => normalized.includes(w.toLowerCase()));
  // NGワードが含まれている場合は、OKワードの有無に関係なく即座に除外します。
  if (hasNegative) {
    const hasPositive = POSITIVE_KEYWORDS.some((w) => normalized.includes(w.toLowerCase()));
    if (hasPositive) {
      return false;
    }
    return true;
  }
  return false;
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
