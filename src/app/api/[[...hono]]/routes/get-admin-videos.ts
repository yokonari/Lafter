import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { desc, eq, and, like } from "drizzle-orm";
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

export function registerGetAdminVideos(app: Hono<AdminEnv>) {
  app.get("/admin/videos", async (c) => {
    const rawPage = c.req.query("page");
    const parsedPage = rawPage ? Number(rawPage) : 1;
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;

    const rawKeyword = c.req.query("q") ?? "";
    const keyword = rawKeyword.trim();

    const rawStatus = c.req.query("video_status");
    const parsedStatus = rawStatus !== undefined ? Number(rawStatus) : 3;
    if (!Number.isInteger(parsedStatus) || parsedStatus < 0 || parsedStatus > 4) {
      return c.json(
        { message: "video_status は 0〜4 の整数で指定してください。" },
        400,
      );
    }
    const videoStatus = parsedStatus;

    // PC からのアクセスなら 50 件、それ以外は 10 件を既定値に据えつつ、limit パラメータで上書き可能にします。
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

    const whereConditions = [eq(videos.status, videoStatus), eq(channels.status, 1)];
    if (keyword) {
      whereConditions.push(like(videos.title, `%${keyword}%`));
    }
    const whereExpression = and(...whereConditions);

    const rows = await db
      .select({
        id: videos.id,
        title: videos.title,
        channelName: channels.name,
      })
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(whereExpression)
      .orderBy(desc(videos.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const hasNext = rows.length === limit;

    const payload = rows.map((row) => ({
      id: row.id,
      url: `https://www.youtube.com/watch?v=${row.id}`,
      title: row.title,
      channel_name: row.channelName ?? "",
    }));

    // 管理画面向けに整形した一覧データを丁寧にお返しいたします。
    return c.json(
      {
        videos: payload,
        page,
        limit,
        hasNext,
      },
      200,
    );
  });
}
