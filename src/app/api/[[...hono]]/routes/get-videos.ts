import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { channels, playlists, videos } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

const MAX_LIMIT = 20;

export function registerGetVideos(app: Hono<AdminEnv>) {
  app.get("/videos", async (c) => {
    const { env } = getCloudflareContext();
    // 型定義済みの env から安全に DB インスタンスを取得いたします。
    const db = createDatabase(env);

    const qRaw = c.req.query("q") ?? "";
    const q = qRaw.trim();
    // 複数キーワードは半角・全角スペースで区切り、すべてを AND で満たすように扱います。
    // 「ダ/ダ」などの正規化差異も吸収するため、NFC/NFD 両方のパターンを用意します。
    const keywords = q ? q.split(/\s+/u).filter(Boolean) : [];
    const normalizedPatternsPerWord = keywords.map((word) => buildLikePatterns(word));
    const mode = c.req.query("mode");
    const channelIdFilter = c.req.query("channelId");
    const offsetParam = Number(c.req.query("offset") ?? 0);
    const safeOffset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0;
    const includePlaylistsParam = c.req.query("includePlaylists");
    const shouldIncludePlaylists =
      includePlaylistsParam === "false" || includePlaylistsParam === "0" ? false : true;
    const channelIdsMatchingQuery: string[] = [];
    if (normalizedPatternsPerWord.length) {
      const channelConditions: SQL<boolean>[] = [
        eq(channels.status, 1) as SQL<boolean>,
      ];
      // 各キーワードに対する OR 群を AND で束ね、全キーワードを含むチャンネルのみ抽出。
      for (const patterns of normalizedPatternsPerWord) {
        const likeParts = patterns.map((pattern) => like(channels.name, pattern) as SQL<boolean>);
        const wordCondition = likeParts.length === 1 ? likeParts[0] : or(...likeParts);
        channelConditions.push(wordCondition as SQL<boolean>);
      }
      const channelWhere =
        channelConditions.length === 1 ? channelConditions[0] : and(...channelConditions);
      const matchedChannels = await db
        .select({ id: channels.id })
        .from(channels)
        .where(channelWhere);
      channelIdsMatchingQuery.push(...matchedChannels.map((row) => row.id));
    }

    const videoConditions = [
      eq(videos.status, 1),
      eq(channels.status, 1),
    ];
    if (channelIdFilter) {
      // チャンネル指定がある場合は最優先でそのチャンネルに絞ります。
      videoConditions.push(eq(videos.channelId, channelIdFilter));
    }
    if (normalizedPatternsPerWord.length) {
      // キーワードごとに (タイトルLIKE または チャンネルID一致) を作り、すべて AND で縛ります。
      const keywordConditions: SQL<boolean>[] = normalizedPatternsPerWord.map((patterns) => {
        const titleMatches = patterns.map((pattern) => like(videos.title, pattern) as SQL<boolean>);
        const checks: SQL<boolean>[] = titleMatches;
        if (channelIdsMatchingQuery.length) {
          // inArray も SQL<unknown> を返すため、boolean 条件へそろえます。
          checks.push(inArray(videos.channelId, channelIdsMatchingQuery) as SQL<boolean>);
        }
        if (checks.length === 1) {
          return checks[0];
        }
        const combined = or(...checks);
        return combined as SQL<boolean>;
      });

      if (keywordConditions.length === 1) {
        videoConditions.push(keywordConditions[0]);
      } else if (keywordConditions.length > 1) {
        videoConditions.push(and(...keywordConditions) as SQL<boolean>);
      }
    }
    const videoWhere =
      videoConditions.length === 1 ? videoConditions[0] : and(...videoConditions);

    const baseVideoQuery = db
      .select({
        id: videos.id,
        title: videos.title,
        publishedAt: videos.publishedAt,
        channelId: channels.id,
        channelName: channels.name,
      })
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(videoWhere);

    const orderedVideoQuery =
      mode === "random"
        ? baseVideoQuery.orderBy(sql`RANDOM()`)
        : baseVideoQuery.orderBy(desc(videos.publishedAt));

    const limitParam = Number(c.req.query("limit") ?? MAX_LIMIT);
    const safeLimit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, MAX_LIMIT)
        : MAX_LIMIT;

    const videoRows = await orderedVideoQuery.limit(safeLimit).offset(safeOffset);

    let playlistRows:
      | Array<{
          id: string;
          title: string;
          channelId: string | null;
          channelName: string | null;
          topVideoId: string | null;
        }>
      | [] = [];
    if (shouldIncludePlaylists) {
      const playlistConditions = [
        eq(playlists.status, 1),
        eq(channels.status, 1),
      ];
    if (normalizedPatternsPerWord.length) {
      // プレイリストもキーワードごとに AND で束ねます。
      const playlistKeywordConditions: SQL<boolean>[] = normalizedPatternsPerWord.map((patterns) => {
        const playlistNameMatches = patterns.map((pattern) => like(playlists.name, pattern) as SQL<boolean>);
        const checks: SQL<boolean>[] = playlistNameMatches;
        if (channelIdsMatchingQuery.length) {
          checks.push(inArray(playlists.channelId, channelIdsMatchingQuery) as SQL<boolean>);
        }
        if (checks.length === 1) {
          return checks[0];
        }
        const combinedPlaylistPattern = or(...checks);
        return combinedPlaylistPattern as SQL<boolean>;
      });

        if (playlistKeywordConditions.length === 1) {
          playlistConditions.push(playlistKeywordConditions[0]);
        } else if (playlistKeywordConditions.length > 1) {
          playlistConditions.push(and(...playlistKeywordConditions) as SQL<boolean>);
        }
      }
      const playlistWhere =
        playlistConditions.length === 1 ? playlistConditions[0] : and(...playlistConditions);

      playlistRows = await db
        .select({
          id: playlists.id,
          title: playlists.name,
          channelId: channels.id,
          channelName: channels.name,
          topVideoId: playlists.topVideoId,
        })
        .from(playlists)
        .innerJoin(channels, eq(playlists.channelId, channels.id))
        .where(playlistWhere)
        .orderBy(desc(playlists.createdAt))
        .limit(MAX_LIMIT)
        .offset(safeOffset);
    }

    const videosPayload = videoRows.map((row) => ({
      id: row.id,
      // YouTube 由来のタイトルに含まれる &quot; などのエンティティを丁寧にデコードします。
      title: decodeHtmlEntities(row.title),
      channel_id: row.channelId,
      channel_name: row.channelName,
      published_at: toUnixTime(row.publishedAt),
    }));

    const playlistsPayload = playlistRows.map((row) => ({
      id: row.id,
      // プレイリスト名も同様にエンティティを整えます。
      title: decodeHtmlEntities(row.title),
      channel_id: row.channelId,
      channel_name: row.channelName,
      top_video_id: row.topVideoId,
    }));

    return c.json(
      {
        videos: videosPayload,
        play_lists: playlistsPayload,
      },
      200,
    );
  });
}

function buildLikePatterns(keyword: string): string[] {
  const variants = [keyword.normalize("NFC"), keyword.normalize("NFD")];
  const unique = Array.from(new Set(variants));
  return unique.map((word) => {
    const escaped = word.replace(/[%_]/g, (m) => `\\${m}`);
    return `%${escaped}%`;
  });
}

function toUnixTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? Math.floor(time / 1000) : 0;
}

function decodeHtmlEntities(value: string): string {
  // 現状問題になっているダブルクォートやアポストロフィ、一般的な &amp; だけを安全にデコードします。
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}
