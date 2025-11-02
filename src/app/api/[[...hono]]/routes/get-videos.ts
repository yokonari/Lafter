import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { channels, playlists, videos } from "@/lib/schema";
import { createDatabase } from "../context";

const MAX_LIMIT = 50;

export function registerGetVideos(app: Hono) {
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

    const videoConditions = [
      eq(videos.status, 1),
      eq(channels.status, 1),
    ];
    if (pattern) {
      const videoSearchCondition = or(
        like(videos.title, pattern),
        like(channels.name, pattern),
        like(sql`coalesce(${channels.artistName}, '')`, pattern),
      );
      if (videoSearchCondition) {
        videoConditions.push(videoSearchCondition);
      }
    }
    if (categoryFilter) {
      videoConditions.push(eq(videos.category, categoryFilter));
    }
    const videoWhere =
      videoConditions.length === 1 ? videoConditions[0] : and(...videoConditions);

    const videoRows = await db
      .select({
        id: videos.id,
        title: videos.title,
        publishedAt: videos.publishedAt,
        category: videos.category,
        channelName: channels.name,
        artistName: channels.artistName,
      })
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(videoWhere)
      .orderBy(desc(videos.publishedAt))
      .limit(MAX_LIMIT);

    const playlistConditions = [
      eq(playlists.status, 1),
      eq(channels.status, 1),
    ];
    if (pattern) {
      const playlistSearchCondition = or(
        like(playlists.name, pattern),
        like(channels.name, pattern),
        like(sql`coalesce(${channels.artistName}, '')`, pattern),
      );
      if (playlistSearchCondition) {
        playlistConditions.push(playlistSearchCondition);
      }
    }
    const playlistWhere =
      playlistConditions.length === 1 ? playlistConditions[0] : and(...playlistConditions);

    const playlistRows = await db
      .select({
        id: playlists.id,
        title: playlists.name,
        artistName: channels.artistName,
        channelName: channels.name,
      })
      .from(playlists)
      .innerJoin(channels, eq(playlists.channelId, channels.id))
      .where(playlistWhere)
      .orderBy(desc(playlists.createdAt))
      .limit(MAX_LIMIT);

    const videosPayload = videoRows.map((row) => ({
      url: `https://www.youtube.com/watch?v=${row.id}`,
      artist_name: row.artistName ?? row.channelName ?? "",
      title: row.title,
      published_at: toUnixTime(row.publishedAt),
      category: typeof row.category === "number" ? row.category : 0,
    }));

    const playlistsPayload = playlistRows.map((row) => ({
      url: `https://www.youtube.com/playlist?list=${row.id}`,
      title: row.title,
      artist_name: row.artistName ?? row.channelName ?? "",
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
