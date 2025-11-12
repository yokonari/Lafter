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
    const categoryRaw = c.req.query("category");
    const category = categoryRaw !== undefined ? Number(categoryRaw) : 0;
    const categoryFilter =
      Number.isFinite(category) && [1, 2, 3].includes(Number(category)) ? Number(category) : 0;

    const pattern = q ? buildLikePattern(q) : undefined;
    const mode = c.req.query("mode");
    const channelIdsMatchingQuery: string[] = [];
    if (pattern) {
      const matchedChannels = await db
        .select({ id: channels.id })
        .from(channels)
        .where(and(eq(channels.status, 1), like(channels.name, pattern)));
      channelIdsMatchingQuery.push(...matchedChannels.map((row) => row.id));
    }

    const videoConditions = [
      eq(videos.status, 1),
      eq(channels.status, 1),
    ];
    if (pattern) {
      const titleMatch = like(videos.title, pattern) as SQL<boolean>;
      // drizzle の like は SQL<unknown> を返すため、論理条件として扱うべく boolean 型にキャストいたします。
      // 型推論で論理条件として扱われるよう、SQL ブール条件の配列型を明示します。
      const patternChecks: SQL<boolean>[] = [titleMatch];
      if (channelIdsMatchingQuery.length) {
        patternChecks.push(
          // inArray も SQL<unknown> を返すため、論理演算に組み込めるよう boolean 条件へ統一いたします。
          inArray(videos.channelId, channelIdsMatchingQuery) as SQL<boolean>,
        );
      }
      if (patternChecks.length === 1) {
        // タイトル条件は先に生成された '`titleMatch`' で保証できますので安全に追加いたします。
        videoConditions.push(titleMatch);
      } else if (patternChecks.length > 1) {
        const combinedPattern = or(...patternChecks);
        if (combinedPattern) {
          // or も undefined を返し得るため、存在確認後に boolean 条件として利用いたします。
          videoConditions.push(combinedPattern as SQL<boolean>);
        }
      }
    }
    if (categoryFilter) {
      videoConditions.push(eq(videos.category, categoryFilter));
    }
    const videoWhere =
      videoConditions.length === 1 ? videoConditions[0] : and(...videoConditions);

    const baseVideoQuery = db
      .select({
        id: videos.id,
        title: videos.title,
        publishedAt: videos.publishedAt,
        category: videos.category,
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

    const videoRows = await orderedVideoQuery.limit(safeLimit);

    const playlistConditions = [
      eq(playlists.status, 1),
      eq(channels.status, 1),
    ];
    if (pattern) {
      const playlistNameMatch = like(playlists.name, pattern) as SQL<boolean>;
      // drizzle の like は SQL<unknown> のため、こちらも boolean 条件として扱えるようキャストしております。
      // プレイリスト検索でも条件は SQL のブール型として扱い、`or` 展開に安全な配列型で保持しておきます。
      const playlistPattern: SQL<boolean>[] = [playlistNameMatch];
      if (channelIdsMatchingQuery.length) {
        playlistPattern.push(
          // プレイリスト側でも inArray の戻りを boolean 型へ揃え、or 展開で型エラーを避けます。
          inArray(playlists.channelId, channelIdsMatchingQuery) as SQL<boolean>,
        );
      }
      if (playlistPattern.length === 1) {
        // プレイリスト名の条件は `playlistNameMatch` で非 undefined を確保しています。
        playlistConditions.push(playlistNameMatch);
      } else if (playlistPattern.length > 1) {
        const combinedPlaylistPattern = or(...playlistPattern);
        if (combinedPlaylistPattern) {
          // プレイリスト条件側でも undefined を弾いたうえで boolean 条件として追加いたします。
          playlistConditions.push(combinedPlaylistPattern as SQL<boolean>);
        }
      }
    }
    const playlistWhere =
      playlistConditions.length === 1 ? playlistConditions[0] : and(...playlistConditions);

    const playlistRows = await db
      .select({
        id: playlists.id,
        title: playlists.name,
        channelName: channels.name,
      })
      .from(playlists)
      .innerJoin(channels, eq(playlists.channelId, channels.id))
      .where(playlistWhere)
      .orderBy(desc(playlists.createdAt))
      .limit(MAX_LIMIT);

    const videosPayload = videoRows.map((row) => ({
               url: `https://www.youtube.com/watch?v=${row.id}`,
      title: row.title,
      published_at: toUnixTime(row.publishedAt),
      category: typeof row.category === "number" ? row.category : 0,
    }));

    const playlistsPayload = playlistRows.map((row) => ({
      url: `https://www.youtube.com/playlist?list=${row.id}`,
      title: row.title,
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

function buildLikePattern(keyword: string): string {
  const escaped = keyword.replace(/[%_]/g, (m) => `\\${m}`);
  return `%${escaped}%`;
}

function toUnixTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? Math.floor(time / 1000) : 0;
}
