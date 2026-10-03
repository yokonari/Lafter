import type { Hono, Context } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { channels, videos } from "@/lib/schema";
import { NEGATIVE_KEYWORDS, POSITIVE_KEYWORDS } from "@/lib/video-keywords";
import { createDatabase, type AppDatabase } from "../context";
// 自動分類は一時的にコメントアウトします。触らないでください。
// import { autoCategorizeVideos } from "./post-videos-auto-categorize";

type TransactionClient = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
type DatabaseClient = AppDatabase | TransactionClient;

type SearchResponseItem = {
  id?: { kind?: string; videoId?: string };
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
type SearchOrder = "date";

type SearchItem = {
  idKind: string;
  videoId?: string;

  channelId: string;
  channelTitle: string;
  publishedAt?: string;
  title: string;
  topVideoId?: string | null;
};

const SEARCH_BASE_URL = "https://www.googleapis.com/youtube/v3/search";
const MAX_RESULTS_PER_PAGE = 50;
const MAX_VIDEOS_TO_SAVE = 300; // API が大量件数を返しても保存・分類処理は300件に丁寧に制限します。
const ABSOLUTE_MAX_PAGES = 6; // ユーザー指定のページ数上限（安全策）

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
    // デフォルトは6ページとします
    let maxPages = parseInt(c.req.query("maxPages") || "6", 10);
    let publishedAfter = (c.req.query("publishedAfter") ?? "").trim();
    let order = parseSearchOrder(c.req.query("order"));
    const useKeywordQuery = parseOptionalBoolean(c.req.query("useKeyword"));
    let useKeyword = useKeywordQuery ?? true;
    let searchKeyword = (c.req.query("searchKeyword") ?? "").trim();

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
      const body = requestJsonBody as {
        channelId?: unknown;
        maxPages?: unknown;
        publishedAfter?: unknown;
        order?: unknown;
        useKeyword?: unknown;
        searchKeyword?: unknown;
      };
      if (!channelId && typeof body.channelId === "string") {
        channelId = body.channelId.trim();
      }
      if (body.maxPages !== undefined && body.maxPages !== null) {
        const parsed = parseInt(String(body.maxPages), 10);
        if (!isNaN(parsed)) {
          maxPages = parsed;
        }
      }
      if (!publishedAfter && typeof body.publishedAfter === "string") {
        publishedAfter = body.publishedAfter.trim();
      }
      // 並び順は許可値のみを受け入れ、未知の値は安全に無視します。
      if (!order) {
        order = parseSearchOrder(body.order);
      }
      if (body.useKeyword !== undefined) {
        const parsed = parseOptionalBoolean(body.useKeyword);
        if (parsed !== undefined) {
          useKeyword = parsed;
        }
      }
      if (!searchKeyword && typeof body.searchKeyword === "string") {
        searchKeyword = body.searchKeyword.trim();
      }
    }

    if (!channelId) {
      return c.json({ message: "channelId を指定してください。" }, 400);
    }

    // 安全のため上限を適用します
    if (maxPages > ABSOLUTE_MAX_PAGES) maxPages = ABSOLUTE_MAX_PAGES;
    if (maxPages < 1) maxPages = 1;

    // チャンネル検索の開始を丁寧にログへ残し、実行条件を把握しやすくします。
    console.log(
      `[channel-search] チャンネル ${channelId} の検索を開始します (maxPages=${maxPages}, publishedAfter=${publishedAfter || "なし"}, order=${order || "default"}, useKeyword=${useKeyword ? "on" : "off"}, searchKeyword=${searchKeyword || "なし"})`,
    );

    try {
      // チャンネルに紐づく動画・再生リストを指定件数ずつ丁寧に収集します。
      const searchItems = await searchChannelItems(channelId, apiKey, {
        maxPages: maxPages,
        publishedAfter: publishedAfter || undefined,
        order,
        useKeyword,
        searchKeyword: searchKeyword || undefined,
      });
      const videoItems = searchItems.filter((i) => i.idKind === "youtube#video");
      // フルサーチであっても保存対象は 300 件までに抑え、DB/分類処理の負荷を丁寧にコントロールします。
      const limitedVideoItems = videoItems.slice(0, MAX_VIDEOS_TO_SAVE);
      // 取得件数をこまめに記録し、API 側の挙動を追跡しやすくします。
      console.log(
        `[channel-search] 取得結果 チャンネル=${channelId} 動画=${videoItems.length}件(保存対象:${limitedVideoItems.length}件) 合計=${searchItems.length}件`,
      );

      const ensuredChannels = new Set<string>();
      const summary = {
        channelId,
        maxPages,
        order: order || "default",
        fetched: searchItems.length,
        videosInserted: 0,

        // サーチAPIで取得した動画タイトルをすべて返し、結果の確認をしやすくします。
        videoTitles: limitedVideoItems.map((v) => v.title),
        errors: [] as string[],
      };

      // チャンネル名の候補は最初に得られた要素から抽出し、IDの代入は行いません。
      const channelTitleFallback =
        limitedVideoItems[0]?.channelTitle || "";

      // 検索APIを呼んだ時点でチャンネルの最終確認時刻を必ず更新し、存在しない場合は作成します。
      try {
        await ensureChannel(db, ensuredChannels, channelId, channelTitleFallback);
      } catch (error) {
        summary.errors.push(
          `channel ${channelId}: ${(error as Error)?.message ?? "チャンネル情報の更新に失敗しました。"
          }`,
        );
      }

      const skipStats = {
        channelFilter: 0,
        videoFilter: 0,
        exists: 0,
        error: 0
      };

      for (const item of limitedVideoItems) {
        if (!item.videoId || !item.channelId) continue;
        const resolvedTitle = item.channelTitle || channelTitleFallback;
        // チャンネル名のNGチェックは行わないため、フィルタリング処理を削除しました。
        // if (shouldSkipChannel(resolvedTitle ?? "")) continue;
        if (shouldSkipVideo(item.title)) {
          skipStats.videoFilter++;
          continue;
        }

        try {
          const exists = await videoExists(db, item.videoId);
          if (exists) {
            skipStats.exists++;
            continue;
          }
          await ensureChannel(db, ensuredChannels, item.channelId, resolvedTitle);
          await insertVideo(db, {
            id: item.videoId,
            title: item.title,
            channelId: item.channelId,
            publishedAt: item.publishedAt,
          });
          summary.videosInserted += 1;
        } catch (error) {
          skipStats.error++;
          if (isUniqueConstraintError(error)) {
            skipStats.exists++; // 重複エラーも実質existsとしてカウント
            continue;
          }
          logSqlError(error);
          summary.errors.push(
            `video ${item.videoId}: ${(error as Error)?.message ?? "動画情報の保存に失敗しました。"
            }`,
          );
        }
      }
      console.log(`[channel-search] 動画登録 success=${summary.videosInserted} skipped(channel=${skipStats.channelFilter}, video=${skipStats.videoFilter}, exists=${skipStats.exists}, error=${skipStats.error})`);



      // 保存直後に該当チャンネルの動画だけを丁寧に自動分類し、分類漏れを防ぎます。
      // 一時的にコメントアウトします。触らないでください。
      // try {
      //   await autoCategorizeVideos(db, { limit: 0, channelId });
      //   console.log(`[channel-search] 自動分類を完了しました channel=${channelId}`);
      // } catch (error) {
      //   summary.errors.push(
      //     `auto-categorize: ${(error as Error)?.message ?? "自動分類の実行に失敗しました。"
      //     }`,
      //   );
      // }

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
  // 管理画面からの呼び出し用（認証ミドルウェアを経由させるため /admin プレフィックスを付与）
  app.post("/admin/channels/search", handler);
}

async function searchChannelItems(
  channelId: string,
  apiKey: string,
  options: { maxPages: number; publishedAfter?: string; order?: SearchOrder; useKeyword?: boolean; searchKeyword?: string },
): Promise<SearchItem[]> {
  const items: SearchItem[] = [];
  let pageToken: string | undefined;
  let hasMore = true;
  let pageFetchCount = 0;

  // 追加取得が必要な場合に nextPageToken を繰り返し使い回します。
  while (hasMore && pageFetchCount < options.maxPages) {
    const url = new URL(SEARCH_BASE_URL);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("channelId", channelId);
    if (options.useKeyword !== false) {
      // searchKeywordが指定されていればそれを使用、なければデフォルトの「ネタ」を使用
      const keyword = options.searchKeyword || "ネタ";
      url.searchParams.set("q", keyword);
    }
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", String(MAX_RESULTS_PER_PAGE));
    url.searchParams.set("safeSearch", "none");
    url.searchParams.set("regionCode", "JP");
    url.searchParams.set("relevanceLanguage", "ja");
    url.searchParams.set("key", apiKey);
    if (options.publishedAfter) {
      url.searchParams.set("publishedAfter", options.publishedAfter);
    }
    if (options.order) {
      url.searchParams.set("order", options.order);
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

            channelId: item.snippet?.channelId ?? "",
            channelTitle: item.snippet?.channelTitle ?? "",
            publishedAt: item.snippet?.publishedAt ?? undefined,
            title: item.snippet?.title ?? "",
            topVideoId: extractVideoIdFromThumbnailUrl(thumbnailUrl),
          };
        })
        .filter((it) => it.idKind === "youtube#video" && Boolean(it.videoId && it.channelId && it.title)),
    );

    pageToken = data.nextPageToken;
    // 次のページトークンがあり、かつ指定ページ数に達していなければ継続します
    hasMore = Boolean(pageToken);
    pageFetchCount += 1;
  }

  return items;
}



function extractVideoIdFromThumbnailUrl(url?: string): string | null {
  if (!url) {
    return null;
  }
  const match = url.match(/\/vi\/([^/]+)\//);
  return match ? match[1] : null;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function parseSearchOrder(value: unknown): SearchOrder | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "date") {
    return "date";
  }
  return undefined;
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
    // 名前更新は channels/check に限定し、ここでは最終確認時刻のみ更新します。
    await updateChannelLastCheckedAt(db, channelId);
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

async function updateChannelLastCheckedAt(db: DatabaseClient, id: string) {
  await db
    .update(channels)
    .set({
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
    // report_status カラムも確実に 0 へ初期化し、NOT NULL 制約違反を丁寧に防ぎます。
    reportStatus: 0,
    lastCheckedAt: new Date().toISOString(),
    // 固定乱数を保存し、ランダム抽出をインデックス検索にします。
    randomKey: Math.random(),
  });
}



function shouldSkipVideo(title: string): boolean {
  const normalized = title.toLowerCase();
  const hasNegative = NEGATIVE_KEYWORDS.some((w) => normalized.includes(w.toLowerCase()));
  const hasPositive = POSITIVE_KEYWORDS.some((w) => normalized.includes(w.toLowerCase()));

  // ポジティブワードが含まれている場合は、NGワードの有無に関係なく除外しません。
  if (hasPositive) {
    return false;
  }
  // ポジティブワードが含まれておらず、NGワードが含まれている場合は除外します。
  if (hasNegative) {
    return true;
  }
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function shouldSkipChannel(name: string): boolean {
  const normalized = name.toLowerCase();
  const hasNegative = NEGATIVE_KEYWORDS.some((w) => normalized.includes(w.toLowerCase()));
  // NGワードを含むチャンネルは安全側で必ず除外します。
  if (hasNegative) {
    return true;
  }
  return false;
}
