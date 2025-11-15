import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq, and } from "drizzle-orm";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { videos, channels } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;
const AUTO_STATUS_OK = 3;

const AUTO_CATEGORIZATION_RULES: Array<{
  key: string;
  keywords?: string[];
  titleRegex?: RegExp;
}> = [
  { key: "manzai", keywords: ["漫才"] },
  { key: "conte", keywords: ["コント"] },
  { key: "neta", keywords: ["ネタ"] },
  { key: "variety", keywords: ["ものまね", "モノマネ", "歌", "あるある"] },
  { key: "titled", titleRegex: /[「」『』【】]/ },
];

type AutoCategorizeRequest = {
  limit?: number;
};

export function registerPostAdminVideosAutoCategorize(app: Hono<AdminEnv>) {
  app.post("/admin/videos/auto-categorize", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const fail = (message: string, status: ContentfulStatusCode = 400) => c.json({ message }, status);

    let body: AutoCategorizeRequest = {};
    try {
      if (c.req.header("content-length")) {
        body = (await c.req.json()) as AutoCategorizeRequest;
      }
    } catch {
      return fail("リクエスト本文を JSON として解釈できませんでした。", 400);
    }

    const limit = normalizeLimit(body.limit);

    const rows = await db
      .select({
        id: videos.id,
        title: videos.title,
        currentStatus: videos.status,
      })
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(and(eq(videos.status, 0), eq(channels.status, 1)))
      .limit(limit);

    if (rows.length === 0) {
      return c.json({ scanned: 0, updated: 0, results: [] });
    }

    const updates: Array<{ id: string; appliedRule: string; previousStatus: number; nextStatus: number }> = [];

    for (const row of rows) {
      const classification = classifyTitle(row.title ?? "");
      if (!classification) continue;

      const nextStatus = AUTO_STATUS_OK;

      const shouldUpdate = row.currentStatus !== nextStatus;
      if (!shouldUpdate) continue;

      await db.update(videos).set({ status: nextStatus }).where(eq(videos.id, row.id));

      updates.push({
        id: row.id,
        appliedRule: classification.key,
        previousStatus: row.currentStatus,
        nextStatus,
      });
    }

    return c.json({ scanned: rows.length, updated: updates.length, results: updates.slice(0, 200) });
  });
}

function classifyTitle(title: string): { key: string } | null {
  if (!title) return null;
  const normalized = title.toLowerCase();
  for (const rule of AUTO_CATEGORIZATION_RULES) {
    const matchedByKeyword = rule.keywords?.some((keyword) => normalized.includes(keyword.toLowerCase())) ?? false;
    const matchedByRegex = rule.titleRegex?.test(title) ?? false;
    if (matchedByKeyword || matchedByRegex) {
      return { key: rule.key };
    }
  }
  return null;
}

function normalizeLimit(rawLimit: number | undefined): number {
  if (rawLimit === undefined || rawLimit === null) {
    return DEFAULT_LIMIT;
  }
  if (!Number.isFinite(rawLimit)) {
    return DEFAULT_LIMIT;
  }
  const limit = Math.trunc(rawLimit);
  if (limit <= 0) return DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) return MAX_LIMIT;
  return limit;
}
