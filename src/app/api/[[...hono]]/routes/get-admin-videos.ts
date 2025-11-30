import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { desc, eq, and, like, count, inArray } from "drizzle-orm";
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

    const rawReportedOnly = c.req.query("reported_only");
    const reportedOnly = rawReportedOnly === "1";
    const effectiveVideoStatus = reportedOnly ? 1 : videoStatus;

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
    // 公開済みチャンネルのみを CTE で事前に抜き出し、本体クエリの JOIN を極力軽量化します。
    const activeChannels = db.$with("active_channels").as(
      db
        .select({
          id: channels.id,
          name: channels.name,
        })
        .from(channels)
        .where(eq(channels.status, 1)),
    );

    const whereConditions = [eq(videos.status, effectiveVideoStatus)];
    const rawChannelId = c.req.query("channel_id") ?? "";
    const channelIdFilter = rawChannelId.trim();
    if (reportedOnly) {
      whereConditions.push(inArray(videos.reportStatus, [1, 2, 3]));
    }
    if (channelIdFilter) {
      whereConditions.push(eq(videos.channelId, channelIdFilter));
    }
    if (keyword) {
      whereConditions.push(like(videos.title, `%${keyword}%`));
    }
    const whereExpression = and(...whereConditions);

    // アクティブチャンネル CTE に JOIN することで、video 側の走査結果へコンパクトに名前を結合します。
    const rows = await db
      .with(activeChannels)
      .select({
        id: videos.id,
        title: videos.title,
        channelName: activeChannels.name,
        channelId: videos.channelId,
        status: videos.status,
        reportStatus: videos.reportStatus,
      })
      .from(videos)
      .innerJoin(activeChannels, eq(videos.channelId, activeChannels.id))
      .where(whereExpression)
      .orderBy(desc(videos.publishedAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const [{ count: totalCount }] = await db
      .with(activeChannels)
      .select({ count: count() })
      .from(videos)
      .innerJoin(activeChannels, eq(videos.channelId, activeChannels.id))
      .where(whereExpression);

    const hasNext = rows.length === limit;

    const payload = rows.map((row) => ({
      id: row.id,
      url: `https://www.youtube.com/watch?v=${row.id}`,
      title: row.title,
      channel_id: row.channelId,
      channel_name: row.channelName ?? "",
      status: row.status,
      report_status: row.reportStatus,
    }));

    // 管理画面向けに整形した一覧データを丁寧にお返しいたします。
    return c.json(
      {
        videos: payload,
        page,
        limit,
        hasNext,
        totalCount,
      },
      200,
    );
  });
}
