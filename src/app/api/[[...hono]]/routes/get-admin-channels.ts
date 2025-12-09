import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, asc, count, desc, eq, inArray, like, max, sql } from "drizzle-orm";
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

    // キーワード検索時は名前順、それ以外は最新動画追加順でソート
    if (keyword) {
      // キーワード検索時は名前順
      const rows = await db
        .select({
          id: channels.id,
          name: channels.name,
          status: channels.status,
        })
        .from(channels)
        .where(whereExpression)
        .orderBy(asc(channels.name))
        .limit(limit)
        .offset((page - 1) * limit);

      const [{ count: totalCount }] = await db
        .select({ count: count() })
        .from(channels)
        .where(whereExpression);

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
        status: row.status ?? 2,
        latest_video_title: latestVideoByChannel.get(row.id)?.title ?? null,
        latest_video_id: latestVideoByChannel.get(row.id)?.videoId ?? null,
      }));

      return c.json(
        {
          channels: payload,
          page,
          limit,
          hasNext,
          totalCount,
        },
        200,
      );
    }

    // デフォルト: 最新動画が追加されたチャンネルを上位に表示
    // チャンネルごとの最新動画のcreatedAtをサブクエリで取得してLEFT JOIN
    const latestVideoSubquery = db
      .select({
        channelId: videos.channelId,
        latestVideoCreatedAt: max(videos.createdAt).as("latest_video_created_at"),
      })
      .from(videos)
      .groupBy(videos.channelId)
      .as("latest_video");

    const rows = await db
      .select({
        id: channels.id,
        name: channels.name,
        status: channels.status,
        latestVideoCreatedAt: latestVideoSubquery.latestVideoCreatedAt,
      })
      .from(channels)
      .leftJoin(latestVideoSubquery, eq(channels.id, latestVideoSubquery.channelId))
      .where(whereExpression)
      .orderBy(
        // 最新動画がないチャンネルは末尾に、ある場合は新しい順
        sql`CASE WHEN ${latestVideoSubquery.latestVideoCreatedAt} IS NULL THEN 1 ELSE 0 END`,
        desc(latestVideoSubquery.latestVideoCreatedAt)
      )
      .limit(limit)
      .offset((page - 1) * limit);

    const [{ count: totalCount }] = await db
      .select({ count: count() })
      .from(channels)
      .where(whereExpression);

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
      status: row.status ?? 2,
      latest_video_title: latestVideoByChannel.get(row.id)?.title ?? null,
      latest_video_id: latestVideoByChannel.get(row.id)?.videoId ?? null,
      latest_video_created_at: row.latestVideoCreatedAt ?? null,
    }));

    // 管理画面向けチャンネル一覧を丁寧にご提供いたします。
    return c.json(
      {
        channels: payload,
        page,
        limit,
        hasNext,
        totalCount,
      },
      200,
    );
  });
}

