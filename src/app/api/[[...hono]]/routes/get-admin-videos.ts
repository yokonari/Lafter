import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { desc, eq, and, like, count, inArray, asc } from "drizzle-orm";
import { videos } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

const DESKTOP_LIMIT = 50;
const NON_DESKTOP_LIMIT = 10;
const MAX_LIMIT = 100;

const DESKTOP_PATTERN = /(windows nt|macintosh|x11|linux x86_64)/i;
const MOBILE_PATTERN = /(iphone|ipad|ipod|android|mobile)/i;

type ActiveChannelRecord = {
  channel_id?: string;
  channel_name?: string | null;
};

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
    const kv = env.LAFTER;
    if (!kv) {
      return c.json(
        { message: "Workers KV LAFTER バインディングが設定されていません。" },
        500,
      );
    }
    const cachedActiveChannelsText = await kv.get("active_channels");
    if (!cachedActiveChannelsText) {
      return c.json(
        { message: "Workers KV に active_channels が存在しません。先に同期を実行してください。" },
        500,
      );
    }
    let cachedActiveChannels: ActiveChannelRecord[] = [];
    try {
      cachedActiveChannels = JSON.parse(cachedActiveChannelsText) as ActiveChannelRecord[];
    } catch {
      return c.json(
        { message: "Workers KV の active_channels データを JSON として解析できませんでした。" },
        500,
      );
    }
    const activeChannelMap = new Map<string, string>();
    for (const entry of cachedActiveChannels) {
      if (entry && typeof entry.channel_id === "string" && entry.channel_id) {
        activeChannelMap.set(entry.channel_id, entry.channel_name ?? "");
      }
    }
    const activeChannelIds = Array.from(activeChannelMap.keys());
    if (activeChannelIds.length === 0) {
      // アクティブチャンネルが存在しない場合は空データを即時返却し、無駄な DB クエリを避けます。
      return c.json(
        {
          videos: [],
          channels: [],
          page,
          limit,
          hasNext: false,
          totalCount: 0,
        },
        200,
      );
    }

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
    whereConditions.push(inArray(videos.channelId, activeChannelIds));
    const whereExpression = and(...whereConditions);

    // KV に格納されたアクティブチャンネル ID を条件に用いて、videos テーブルのみから丁寧に取得します。
    const rows = await db
      .select({
        id: videos.id,
        title: videos.title,
        channelId: videos.channelId,
        status: videos.status,
        reportStatus: videos.reportStatus,
      })
      .from(videos)
      .where(whereExpression)
      .orderBy(desc(videos.publishedAt))
      .limit(limit)
      .offset((page - 1) * limit);

    // 条件に合致する動画を保有しているチャンネルのみを videos テーブルから抽出し、KV に保存された名称へ丁寧に紐付けます。
    const channelRows = await db
      .select({
        channelId: videos.channelId,
      })
      .from(videos)
      .where(whereExpression)
      .groupBy(videos.channelId)
      .orderBy(asc(videos.channelId));

    const channelList = channelRows
      .map((row) => ({
        id: row.channelId,
        name: activeChannelMap.get(row.channelId) ?? "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const [{ count: totalCount }] = await db
      .select({ count: count() })
      .from(videos)
      .where(whereExpression);

    const hasNext = rows.length === limit;

    const payload = rows.map((row) => ({
      id: row.id,
      url: `https://www.youtube.com/watch?v=${row.id}`,
      title: row.title,
      channel_id: row.channelId,
      channel_name: activeChannelMap.get(row.channelId) ?? "",
      status: row.status,
      report_status: row.reportStatus,
    }));

    // 管理画面向けに整形した一覧データを丁寧にお返しいたします。
    return c.json(
      {
        videos: payload,
        channels: channelList,
        page,
        limit,
        hasNext,
        totalCount,
      },
      200,
    );
  });
}
