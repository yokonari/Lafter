import type { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, asc, eq, sql } from "drizzle-orm";
import { channels, videos } from "@/lib/schema";
import { ADMIN_SECRET_HEADER } from "@/lib/api-secret";
import { NEGATIVE_KEYWORDS, POSITIVE_KEYWORDS } from "@/lib/video-keywords";
import { createDatabase, type AppDatabase } from "../context";
import type { AdminEnv } from "../types";

const MAX_CHANNELS_PER_RUN = 50;
const MAX_ITEMS_PER_CHANNEL = 15;

type ChannelRow = {
  id: string;
  name: string;
};

type FeedEntry = {
  videoId: string;
  title: string;
  publishedAt?: string;
  views?: string; // 視聴回数（未公開動画の判定に使用）
};

type VideoInsertRow = typeof videos.$inferInsert;

export function registerPostVideosRss(app: Hono<AdminEnv>) {
  // Cron から直接叩けるよう /admin 外に公開し、共有シークレットで丁寧に保護します。
  app.post("/videos/rss-sync", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const fail = (message: string, status: ContentfulStatusCode = 400) =>
      c.json({ message }, status);

    const adminSecret = c.req.header(ADMIN_SECRET_HEADER);

    const channelIdParam = (c.req.query("channelId") ?? "").trim();
    let limit = normalizeLimit(c.req.query("limit"));

    if (channelIdParam) {
      limit = 1;
    }

    const targetChannels = await loadTargetChannels(db, {
      channelId: channelIdParam || undefined,
      limit,
    });

    if (targetChannels.length === 0) {
      if (channelIdParam) {
        return fail(`channelId=${channelIdParam} に該当する有効なチャンネルが見つかりません。`, 404);
      }
      return c.json(
        {
          message: "処理対象のチャンネルが見つかりませんでした。",
          requestedStatus: 1,
          channels: 0,
          inserted: 0,
          items: 0,
          errors: [],
        },
        200,
      );
    }

    const summary = {
      channelsRequested: targetChannels.length,
      channelsProcessed: 0,
      itemsFetched: 0,
      itemsInserted: 0,
      itemsSkipped: 0,
      errors: [] as string[],
      channelsWithMaxInserts: [] as string[],
      rss404Channels: [] as string[],
      searchFallbackTriggered: 0,
      searchFallbackSucceeded: 0,
      searchFallbackFailed: 0,
    };

    for (const channel of targetChannels) {
      const now = new Date().toISOString();
      try {
        const feed = await fetchChannelFeed(channel.id);
        const parsed = parseChannelFeed(feed);
        const entries = parsed.entries.slice(0, MAX_ITEMS_PER_CHANNEL);
        summary.itemsFetched += entries.length;

        // RSS エントリを動画テーブルへ登録する際に必要な情報を整形し、不要な項目を丁寧に除外します。
        const insertable = entries
          .filter((entry) => entry.videoId && entry.title)
          .filter((entry) => entry.views !== "0") // views="0"の未公開動画をスキップ
          .filter((entry) => !shouldSkipVideo(entry.title))
          .map((entry) => ({
            id: entry.videoId,
            title: entry.title,
            channelId: channel.id,
            publishedAt: entry.publishedAt ?? null,
            status: 0,
            reportStatus: 0,
            lastCheckedAt: now,
            // 固定乱数を保存し、ランダムキャッシュ生成時の全件ソートを避けます。
            randomKey: Math.random(),
          }));

        if (insertable.length > 0) {
          // 既存レコードは丁寧にスキップし、新規分のみを INSERT します。
          const upsertResult = await insertVideosSafely(db, insertable);
          summary.itemsInserted += upsertResult.inserted;
          summary.itemsSkipped += upsertResult.skipped;

          // 登録件数が上限に達している場合は追加検索の候補として丁寧にリストアップします。
          // ユーザー要望により、取得件数ではなく「実際に保存（新規登録）された動画数」が上限に達した場合を条件とします。
          if (upsertResult.inserted >= MAX_ITEMS_PER_CHANNEL) {
            summary.channelsWithMaxInserts.push(channel.id);
          }
        }

        summary.channelsProcessed += 1;
      } catch (error) {
        console.error("[videos/rss-sync] RSS 取得に失敗しました", channel.id, error);
        summary.errors.push(`${channel.id}: ${(error as Error)?.message ?? "RSS 取得に失敗しました。"}`);

        // RSSが404のチャンネルは、RSSの代替として即時にSearch APIで補完取得を試行します。
        if (isRssFetchError(error) && error.status === 404) {
          summary.rss404Channels.push(channel.id);
          summary.searchFallbackTriggered += 1;
          console.error(
            "[videos/rss-sync] RSS 404 詳細",
            `channel=${channel.id}`,
            `feedUrl=${error.feedUrl}`,
            `responseUrl=${error.responseUrl ?? "-"}`,
            `contentType=${error.responseContentType ?? "-"}`,
            `body=${error.responseBodySnippet ?? "-"}`,
          );

          if (!adminSecret) {
            summary.searchFallbackFailed += 1;
            console.error(`[videos/rss-sync] Search API フォールバックをスキップしました channel=${channel.id} reason=missing_admin_secret`);
          } else {
            const fallbackResult = await runChannelSearchFallback({
              requestUrl: c.req.url,
              adminSecret,
              channelId: channel.id,
            });

            if (fallbackResult.ok) {
              summary.searchFallbackSucceeded += 1;
              console.log(`[videos/rss-sync] Search API フォールバック成功 channel=${channel.id} inserted=${fallbackResult.videosInserted ?? "?"}`);
            } else {
              summary.searchFallbackFailed += 1;
              summary.errors.push(`${channel.id}: Search API フォールバック失敗(HTTP ${fallbackResult.status})`);
              console.error(
                `[videos/rss-sync] Search API フォールバック失敗 channel=${channel.id} status=${fallbackResult.status} body=${fallbackResult.bodySnippet}`,
              );
            }
          }
        }
      } finally {
        // 巡回完了後は必ず lastCheckedAt を更新し、次回巡回対象の決定に反映させます。
        await db
          .update(channels)
          // チャンネル名の更新は channels/check に限定し、ここでは確認時刻のみ更新します。
          .set({ lastCheckedAt: now })
          .where(eq(channels.id, channel.id));
      }
      // YouTube API のレート制限を考慮しつつ、CPU時間制限を回避するため sleep を最小限に抑えます。
      await sleep(100);
    }

    return c.json(
      {
        message: "YouTube RSS の取得が完了しました。",
        requestedStatus: 1,
        ...summary,
      },
      200,
    );
  });
}

function normalizeLimit(value?: string | null): number {
  if (!value) {
    return MAX_CHANNELS_PER_RUN;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return MAX_CHANNELS_PER_RUN;
  }
  const normalized = Math.trunc(parsed);
  if (normalized <= 0) {
    return 1;
  }
  if (normalized > MAX_CHANNELS_PER_RUN) {
    return MAX_CHANNELS_PER_RUN;
  }
  return normalized;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadTargetChannels(db: AppDatabase, options: {
  channelId?: string;
  limit: number;
}): Promise<ChannelRow[]> {
  // 各チャンネルで「公開日が直近2年以内の status=1 動画」を持っているか丁寧に確認する EXISTS 句です。
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  const twoYearsAgoIso = d.toISOString();
  const hasRecentActiveVideos = sql`
    EXISTS (
      SELECT 1 FROM ${videos}
      WHERE ${videos.channelId} = ${channels.id}
        AND ${videos.status} = 1
        AND ${videos.publishedAt} IS NOT NULL
        AND ${videos.publishedAt} >= ${twoYearsAgoIso}
    )
  `;

  if (options.channelId) {
    const rows = await db
      .select({ id: channels.id, name: channels.name })
      .from(channels)
      .where(
        and(
          eq(channels.id, options.channelId),
          eq(channels.status, 1),
          sql`${channels.lastCheckedAt} IS NOT NULL`,
          hasRecentActiveVideos,
        ),
      )
      .limit(1);
    return rows;
  }

  // lastCheckedAt が NULL のチャネルは巡回対象から丁寧に除外しつつ、直近1年以内に公開された動画を持つチャンネルのみを古い順に処理します。
  return db
    .select({ id: channels.id, name: channels.name })
    .from(channels)
    .where(
      and(
        eq(channels.status, 1),
        sql`${channels.lastCheckedAt} IS NOT NULL`,
        hasRecentActiveVideos,
      ),
    )
    .orderBy(asc(channels.lastCheckedAt), asc(channels.createdAt))
    .limit(options.limit);
}

async function fetchChannelFeed(channelId: string): Promise<string> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        accept: "application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
      },
    });
  } catch (error) {
    throw new Error(`RSS 取得時にネットワークエラーが発生しました: ${(error as Error).message}`);
  }

  if (!response.ok) {
    const bodyText = await safeReadText(response);
    const bodySnippet = bodyText.slice(0, 240).replace(/\s+/g, " ").trim();
    const responseContentType = response.headers.get("content-type") ?? undefined;
    // 404原因を追跡できるよう、レスポンス情報を含む専用エラーで投げます。
    throw new RssFetchError({
      message: `RSS 取得に失敗しました。(HTTP ${response.status})`,
      status: response.status,
      feedUrl: url,
      responseUrl: response.url || undefined,
      responseContentType,
      responseBodySnippet: bodySnippet || undefined,
    });
  }

  try {
    return await response.text();
  } catch (error) {
    throw new Error(`RSS 応答の読み込みに失敗しました: ${(error as Error).message}`);
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

type SearchFallbackResult =
  | { ok: true; videosInserted?: number }
  | { ok: false; status: number; bodySnippet: string };

async function runChannelSearchFallback(params: {
  requestUrl: string;
  adminSecret: string;
  channelId: string;
}): Promise<SearchFallbackResult> {
  const searchUrl = new URL("/api/channels/search", params.requestUrl);
  searchUrl.searchParams.set("channelId", params.channelId);
  searchUrl.searchParams.set("isFullSearch", "false");
  // RSS 404 フォールバック時は固定キーワード検索（デフォルトの「ネタ」）を無効化します。
  searchUrl.searchParams.set("useKeyword", "false");
  // RSS 404 フォールバック時は公開日順で取得し、直近動画の補完漏れを減らします。
  searchUrl.searchParams.set("order", "date");
  const fourteenDaysAgo = new Date();
  // RSS 404 のフォールバックでは、取りこぼしを減らすため公開日を14日前まで広げます。
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  searchUrl.searchParams.set("publishedAfter", fourteenDaysAgo.toISOString());

  const response = await fetch(searchUrl.toString(), {
    method: "POST",
    headers: {
      [ADMIN_SECRET_HEADER]: params.adminSecret,
    },
  });

  if (!response.ok) {
    const bodyText = await safeReadText(response);
    return {
      ok: false,
      status: response.status,
      bodySnippet: bodyText.slice(0, 240).replace(/\s+/g, " ").trim(),
    };
  }

  try {
    const body = await response.json() as { videosInserted?: number };
    return { ok: true, videosInserted: body.videosInserted };
  } catch {
    return { ok: true };
  }
}

class RssFetchError extends Error {
  readonly status: number;
  readonly feedUrl: string;
  readonly responseUrl?: string;
  readonly responseContentType?: string;
  readonly responseBodySnippet?: string;

  constructor(params: {
    message: string;
    status: number;
    feedUrl: string;
    responseUrl?: string;
    responseContentType?: string;
    responseBodySnippet?: string;
  }) {
    super(params.message);
    this.name = "RssFetchError";
    this.status = params.status;
    this.feedUrl = params.feedUrl;
    this.responseUrl = params.responseUrl;
    this.responseContentType = params.responseContentType;
    this.responseBodySnippet = params.responseBodySnippet;
  }
}

function isRssFetchError(error: unknown): error is RssFetchError {
  return error instanceof RssFetchError;
}

function parseChannelFeed(xml: string): { channelTitle?: string; entries: FeedEntry[] } {
  const entries: FeedEntry[] = [];
  if (!xml) {
    return { entries };
  }

  const beforeFirstEntry = xml.split("<entry")[0] ?? "";
  const channelTitleMatch = beforeFirstEntry.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const channelTitle = channelTitleMatch ? decodeXmlEntities(channelTitleMatch[1].trim()) : undefined;

  const entryMatches = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  for (const rawEntry of entryMatches) {
    const videoId = extractTag(rawEntry, "yt:videoId");
    const title = extractTag(rawEntry, "title");
    const published = extractTag(rawEntry, "published");
    const views = extractViewsAttribute(rawEntry); // 視聴回数を抽出
    if (!videoId || !title) {
      continue;
    }
    entries.push({
      videoId,
      title,
      publishedAt: published,
      views,
    });
    if (entries.length >= MAX_ITEMS_PER_CHANNEL) {
      break;
    }
  }

  return { channelTitle, entries };
}

function extractTag(xml: string, tagName: string): string | undefined {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\/${escaped}>`, "i");
  const match = xml.match(regex);
  if (!match) {
    return undefined;
  }
  return decodeXmlEntities(match[1].trim());
}

// media:statistics タグから views 属性を抽出する関数
function extractViewsAttribute(xml: string): string | undefined {
  const match = xml.match(/<media:statistics\s+views="([^"]*)"/i);
  return match ? match[1] : undefined;
}

function decodeXmlEntities(value: string): string {
  // 最低限のXMLエンティティを丁寧にデコードします。
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function shouldSkipVideo(title: string): boolean {
  const normalized = title.toLowerCase();
  const hasNegative = NEGATIVE_KEYWORDS.some((keyword) =>
    normalized.includes(keyword.toLowerCase()),
  );
  const hasPositive = POSITIVE_KEYWORDS.some((keyword) =>
    normalized.includes(keyword.toLowerCase()),
  );
  // OK ワードが含まれている場合は NG ワードがあっても優先採用し、除外しません。
  if (hasPositive) {
    return false;
  }
  // OK ワードが含まれていない場合のみ、NG ワード検知で除外します。
  return hasNegative;
}

type InsertVideosResult = {
  inserted: number;
  skipped: number;
};

async function insertVideosSafely(db: AppDatabase, rows: VideoInsertRow[]): Promise<InsertVideosResult> {
  if (rows.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  // N+1クエリ問題を解消するため、全動画IDの存在確認を1回のクエリで実行します。
  const videoIds = rows.map((row) => row.id);
  const existingVideos = await db
    .select({ id: videos.id })
    .from(videos)
    .where(sql`${videos.id} IN (${sql.join(videoIds.map((id) => sql`${id}`), sql`, `)})`)
    .then((results) => new Set(results.map((r) => r.id)));

  // 既存の動画を除外し、新規動画のみを抽出します。
  const newRows = rows.filter((row) => !existingVideos.has(row.id));
  const skipped = rows.length - newRows.length;

  if (newRows.length === 0) {
    return { inserted: 0, skipped };
  }

  // 一括INSERTでCPU時間を大幅に削減します。
  // SQLiteの制限を考慮し、100件ずつに分割して挿入します。
  let inserted = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
    const batch = newRows.slice(i, i + BATCH_SIZE);
    try {
      await db.insert(videos).values(batch);
      inserted += batch.length;
    } catch (error) {
      // バッチINSERTが失敗した場合は、個別に再試行します。
      console.warn("[videos/rss-sync] バッチINSERT失敗、個別に再試行します", error);
      for (const row of batch) {
        try {
          // レースコンディション対策: 再度存在確認してからINSERT
          const exists = await videoExists(db, row.id);
          if (!exists) {
            await db.insert(videos).values(row);
            inserted += 1;
          }
        } catch (individualError) {
          // 個別INSERTも失敗した場合は、最終確認してスキップ
          const existsAfterFailure = await videoExists(db, row.id);
          if (!existsAfterFailure) {
            console.error("[videos/rss-sync] 動画の挿入に失敗しました", row.id, individualError);
          }
        }
      }
    }
  }

  return { inserted, skipped };
}

async function videoExists(db: AppDatabase, videoId: string): Promise<boolean> {
  // 主キー検索で存在確認を行い、既知の動画を丁寧に除外します。
  // この関数は一括チェック失敗時のフォールバック用です。
  const rows = await db
    .select({ id: videos.id })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  return rows.length > 0;
}
