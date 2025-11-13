import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, asc, desc, eq, inArray, like } from "drizzle-orm";
import { channels, videos } from "@/lib/schema";
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

export function registerGetAdminChannels(app: Hono<AdminEnv>) {
  app.get("/admin/channels", async (c) => {
    const rawPage = c.req.query("page");
    const parsedPage = rawPage ? Number(rawPage) : 1;
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;

    const rawKeyword = c.req.query("q") ?? "";
    const keyword = rawKeyword.trim();

    const rawStatus = c.req.query("channel_status");
    const parsedStatus = rawStatus !== undefined ? Number(rawStatus) : 3;
    if (!Number.isInteger(parsedStatus) || parsedStatus < 0 || parsedStatus > 4) {
      return c.json(
        { message: "channel_status は 0〜4 の整数で指定してください。" },
        400,
      );
    }
    const channelStatus = parsedStatus;

    // クライアントの User-Agent と limit パラメータを丁寧に判定し、PC なら 50 件・それ以外は 10 件を既定値とします。
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

    const conditions = [eq(channels.status, channelStatus)];
    const statusCondition =
      conditions.length === 1 ? conditions[0] : and(...conditions);

    const whereExpression = keyword
      ? and(statusCondition, like(channels.name, `%${keyword}%`))
      : statusCondition;

    const baseQuery = db
      .select({
        id: channels.id,
        name: channels.name,
        status: channels.status,
        keyword: channels.keyword,
      })
      .from(channels)
      .where(whereExpression);

    const rows = await baseQuery
      .orderBy(keyword ? asc(channels.name) : desc(channels.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const hasNext = rows.length === limit;

    const latestVideoByChannel = new Map<string, { title: string; videoId: string | null }>();
    if (rows.length > 0) {
      const channelIds = rows.map((row) => row.id);
      const videoRows = await db
        .select({
          channelId: videos.channelId,
          title: videos.title,
          videoId: videos.id,
        })
        .from(videos)
        .where(inArray(videos.channelId, channelIds))
        .orderBy(desc(videos.createdAt));
      for (const video of videoRows) {
        if (!video.channelId) continue;
        if (!latestVideoByChannel.has(video.channelId)) {
          latestVideoByChannel.set(video.channelId, {
            title: video.title ?? "",
            videoId: video.videoId ?? null,
          });
        }
      }
    }

    const payload = rows.map((row) => ({
      id: row.id,
      url: `https://www.youtube.com/channel/${row.id}`,
      name: row.name,
      status: row.status ?? 0,
      keyword: row.keyword ?? "",
      latest_video_title: latestVideoByChannel.get(row.id)?.title ?? null,
      latest_video_id: latestVideoByChannel.get(row.id)?.videoId ?? null,
    }));

    // 管理画面向けチャンネル一覧を丁寧にご提供いたします。
    return c.json(
      {
        channels: payload,
        page,
        limit,
        hasNext,
      },
      200,
    );
  });
}
