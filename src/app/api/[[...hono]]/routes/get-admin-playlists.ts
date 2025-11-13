import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, desc, eq } from "drizzle-orm";
import { channels, playlists } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

const DESKTOP_LIMIT = 50;
const NON_DESKTOP_LIMIT = 10;
const MAX_LIMIT = 100;

const DESKTOP_PATTERN = /(windows nt|macintosh|x11|linux x86_64)/i;
const MOBILE_PATTERN = /(iphone|ipad|ipod|android|mobile)/i;

function resolveDefaultLimit(userAgentHeader: string | null): number {
  const ua = userAgentHeader ?? "";
  if (ua && MOBILE_PATTERN.test(ua)) {
    return NON_DESKTOP_LIMIT;
  }
  if (ua && DESKTOP_PATTERN.test(ua)) {
    return DESKTOP_LIMIT;
  }
  return NON_DESKTOP_LIMIT;
}

export function registerGetAdminPlaylists(app: Hono<AdminEnv>) {
  app.get("/admin/play_lists", async (c) => {
    const rawPage = c.req.query("page");
    const parsedPage = rawPage ? Number(rawPage) : 1;
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
    const rawStatus = c.req.query("playlist_status");
    const parsedStatus = rawStatus !== undefined ? Number(rawStatus) : 0;
    if (!Number.isInteger(parsedStatus) || parsedStatus < 0 || parsedStatus > 2) {
      return c.json(
        { message: "playlist_status は 0〜2 の整数で指定してください。" },
        400,
      );
    }
    const playlistStatus = parsedStatus;

    // PC 判定時は 50 件、それ以外は 10 件を既定の取得件数とし、必要に応じて limit で上書きします。
    const rawLimit = c.req.query("limit");
    const userAgent = c.req.header("user-agent") ?? null;
    const defaultLimit = resolveDefaultLimit(userAgent);
    let limit = defaultLimit;
    if (rawLimit !== undefined) {
      const parsedLimit = Number(rawLimit);
      if (!Number.isFinite(parsedLimit) || parsedLimit <= 0 || parsedLimit > MAX_LIMIT) {
        return c.json(
          { message: `limit は 1〜${MAX_LIMIT} の整数で指定してください。` },
          400,
        );
      }
      limit = Math.floor(parsedLimit);
    }

    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const rows = await db
      .select({
        id: playlists.id,
        name: playlists.name,
        status: playlists.status,
        topVideoId: playlists.topVideoId,
        channelName: channels.name,
      })
      .from(playlists)
      .innerJoin(channels, eq(playlists.channelId, channels.id))
      .where(
        and(
          eq(playlists.status, playlistStatus),
          eq(channels.status, 1),
        ),
      )
      .orderBy(desc(playlists.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const hasNext = rows.length === limit;

    const payload = rows.map((row) => ({
      id: row.id,
      url: `https://www.youtube.com/playlist?list=${row.id}`,
      title: row.name,
      status: row.status ?? 0,
      channel_name: row.channelName ?? "",
      top_video_id: row.topVideoId ?? null,
    }));

    // 管理画面向けプレイリスト一覧を丁寧にご提供いたします。
    return c.json(
      {
        play_lists: payload,
        page,
        limit,
        hasNext,
      },
      200,
    );
  });
}
