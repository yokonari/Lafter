import type { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, asc, eq, sql } from "drizzle-orm";
import { channels, videos } from "@/lib/schema";
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
};

type VideoInsertRow = typeof videos.$inferInsert;

export function registerPostVideosRss(app: Hono<AdminEnv>) {
  // Cron から直接叩けるよう /admin 外に公開し、共有シークレットで丁寧に保護します。
  app.post("/videos/rss-sync", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const fail = (message: string, status: ContentfulStatusCode = 400) =>
      c.json({ message }, status);

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
      itemsUpdated: 0,
      errors: [] as string[],
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
          .filter((entry) => !shouldSkipVideo(entry.title))
          .map((entry) => ({
            id: entry.videoId,
            title: entry.title,
            channelId: channel.id,
            publishedAt: entry.publishedAt ?? null,
            status: 0,
            reportStatus: 0,
            lastCheckedAt: now,
          }));

        if (insertable.length > 0) {
          // 既存レコードがあっても最新情報を丁寧に反映できるよう、逐次 INSERT/UPDATE を行います。
          const upsertResult = await insertVideosSafely(db, insertable);
          summary.itemsInserted += upsertResult.inserted;
          summary.itemsUpdated += upsertResult.updated;
        }

        const channelUpdate: Partial<typeof channels.$inferInsert> = {};
        if (parsed.channelTitle && parsed.channelTitle !== channel.name) {
          channelUpdate.name = parsed.channelTitle;
        }
        if (Object.keys(channelUpdate).length > 0) {
          await db
            .update(channels)
            .set(channelUpdate)
            .where(eq(channels.id, channel.id));
        }

        summary.channelsProcessed += 1;
      } catch (error) {
        console.error("[videos/rss-sync] RSS 取得に失敗しました", channel.id, error);
        summary.errors.push(`${channel.id}: ${(error as Error)?.message ?? "RSS 取得に失敗しました。"}`);
      }
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

async function loadTargetChannels(db: AppDatabase, options: {
  channelId?: string;
  limit: number;
}): Promise<ChannelRow[]> {
  if (options.channelId) {
    const rows = await db
      .select({ id: channels.id, name: channels.name })
      .from(channels)
      .where(and(eq(channels.id, options.channelId), eq(channels.status, 1)))
      .limit(1);
    return rows;
  }

  const orderByNullsFirst = sql`CASE WHEN ${channels.lastCheckedAt} IS NULL THEN 0 ELSE 1 END`;
  return db
    .select({ id: channels.id, name: channels.name })
    .from(channels)
    .where(eq(channels.status, 1))
    .orderBy(orderByNullsFirst, asc(channels.lastCheckedAt), asc(channels.createdAt))
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
    throw new Error(`RSS 取得に失敗しました。(HTTP ${response.status})`);
  }

  try {
    return await response.text();
  } catch (error) {
    throw new Error(`RSS 応答の読み込みに失敗しました: ${(error as Error).message}`);
  }
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
    if (!videoId || !title) {
      continue;
    }
    entries.push({
      videoId,
      title,
      publishedAt: published,
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
  updated: number;
};

async function insertVideosSafely(db: AppDatabase, rows: VideoInsertRow[]): Promise<InsertVideosResult> {
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    // まず UPDATE を試みることで、既存動画があればその場で最新情報を反映します。
    const alreadyUpdated = await updateVideoIfExists(db, row);
    if (alreadyUpdated) {
      updated += 1;
      continue;
    }

    try {
      await db.insert(videos).values(row);
      inserted += 1;
    } catch (error) {
      // INSERT が失敗した場合は状況を丁寧に記録し、UPDATE へ切り替えます。
      console.warn("[videos/rss-sync] INSERT に失敗したため UPDATE を試行します", row.id, error);
      // INSERT に失敗した場合も、最終的に UPDATE へ切り替えられるかを丁寧に確認します。
      const updatedExisting = await updateVideoIfExists(db, row, error);
      if (!updatedExisting) {
        throw error;
      }
      updated += 1;
    }
  }
  return { inserted, updated };
}

async function updateVideoIfExists(db: AppDatabase, row: VideoInsertRow, reason?: unknown): Promise<boolean> {
  try {
    const result = await db
      .update(videos)
      .set({
        title: row.title,
        channelId: row.channelId,
        publishedAt: row.publishedAt ?? null,
        status: row.status ?? 0,
        reportStatus: row.reportStatus ?? 0,
        lastCheckedAt: row.lastCheckedAt ?? null,
      })
      .where(eq(videos.id, row.id));
    const changes = getAffectedRowCount(result);
    if (changes > 0) {
      if (reason) {
        // INSERT 失敗時にも確実に情報を反映できるよう、丁寧に UPDATE へ切り替えます。
        console.warn("[videos/rss-sync] INSERT から UPDATE に切り替え", row.id, reason);
      }
      return true;
    }
    return false;
  } catch (updateError) {
    console.error("[videos/rss-sync] 既存動画の UPDATE も失敗", row.id, updateError);
    return false;
  }
}

function getAffectedRowCount(result: unknown): number {
  if (!result || typeof result !== "object") {
    return 0;
  }
  const meta = (result as { meta?: { changes?: number } }).meta;
  return meta?.changes ?? 0;
}
