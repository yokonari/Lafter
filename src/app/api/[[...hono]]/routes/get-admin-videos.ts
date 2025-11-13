import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { desc, eq, and, like, or, isNull } from "drizzle-orm";
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

    const rawCategory = c.req.query("category");
    let categoryFilter: number | null = null;
    if (rawCategory !== undefined && rawCategory !== null) {
      const categoryText = rawCategory.trim();
      if (categoryText && categoryText !== "all") {
        const parsedCategory = Number(categoryText);
        if (!Number.isInteger(parsedCategory) || parsedCategory < 0 || parsedCategory > 4) {
          return c.json(
            { message: "category は 0〜4 の整数で指定してください。" },
            400,
          );
        }
        categoryFilter = parsedCategory;
      }
    }

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
    if (categoryFilter !== null) {
      if (categoryFilter === 0) {
        // 未分類は 0 と null の両方を対象とし、従来の管理画面表示と揃えます。
        const unclassifiedCondition = or(isNull(videos.category), eq(videos.category, 0));
        if (unclassifiedCondition) {
          whereConditions.push(unclassifiedCondition);
        }
      } else {
        whereConditions.push(eq(videos.category, categoryFilter));
      }
    }
    const whereExpression = and(...whereConditions);

    const rows = await db
      .select({
        id: videos.id,
        title: videos.title,
        category: videos.category,
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
      category: typeof row.category === "number" ? row.category : null,
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
