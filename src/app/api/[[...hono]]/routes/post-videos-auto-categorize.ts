import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq, and, inArray } from "drizzle-orm";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { videos, channels } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

const DEFAULT_LIMIT = 500;

const AUTO_STATUS_OK = 3;

const AUTO_CATEGORIZATION_RULES: Array<{
  key: string;
  keywords?: string[];
  titleRegex?: RegExp;
}> = [
    { key: "manzai", keywords: ["漫才", "漫談"] },
    { key: "conte", keywords: ["コント"] },
    { key: "neta", keywords: ["ネタ"] },
    { key: "variety", keywords: ["ものまね", "モノマネ", "歌", "あるある"] },
  ];

type AutoCategorizeRequest = {
  limit?: number;
  channelId?: string;
};

export function registerPostVideosAutoCategorize(app: Hono<AdminEnv>) {
  app.post("/videos/auto-categorize", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const fail = (message: string, status: ContentfulStatusCode = 400) => c.json({ message }, status);

    let body: AutoCategorizeRequest = {};
    try {
      // 空ボディでも処理できるよう content-length を丁寧に確認したうえで JSON を読み込みます。
      if (c.req.header("content-length")) {
        body = (await c.req.json()) as AutoCategorizeRequest;
      }
    } catch {
      return fail("リクエスト本文を JSON として解釈できませんでした。", 400);
    }

    const limit = normalizeLimit(body.limit);
    const channelId = typeof body.channelId === "string" ? body.channelId.trim() || undefined : undefined;

    // 管理向けと同一ロジックでステータス自動分類を実行し、検索後のワーカーからも再利用できるようにします。
    const result = await autoCategorizeVideos(db, { limit, channelId });

    return c.json(result);
  });
}

function normalizeLimit(rawLimit: number | undefined): number {
  if (rawLimit === undefined || rawLimit === null) {
    return DEFAULT_LIMIT;
  }
  if (!Number.isFinite(rawLimit)) {
    return DEFAULT_LIMIT;
  }
  const limit = Math.trunc(rawLimit);
  // 0以下の場合は制限なしとみなします。
  if (limit <= 0) return 0;
  return limit;
}

type AutoCategorizeRow = {
  id: string;
  title: string | null;
  currentStatus: number;
};

type AutoCategorizeResult = {
  scanned: number;
  updated: number;
  results: Array<{ id: string; appliedRule: string; previousStatus: number; nextStatus: number }>;
};

export async function autoCategorizeVideos(
  db: ReturnType<typeof createDatabase>,
  options: { limit: number; channelId?: string },
): Promise<AutoCategorizeResult> {
  // ステータス未確定(status=0)かつ有効チャンネルの動画だけを丁寧に抽出します。チャンネルID指定時はそのチャンネルだけを対象にします。
  let baseCondition = and(eq(videos.status, 0), eq(channels.status, 1));
  if (options.channelId) {
    baseCondition = and(baseCondition, eq(videos.channelId, options.channelId));
  }

  const query = db
    .select({
      id: videos.id,
      title: videos.title,
      currentStatus: videos.status,
    })
    .from(videos)
    .innerJoin(channels, eq(videos.channelId, channels.id))
    .where(baseCondition);

  if (options.limit > 0) {
    query.limit(options.limit);
  }

  const rows = (await query) as AutoCategorizeRow[];

  if (rows.length === 0) {
    return { scanned: 0, updated: 0, results: [] };
  }

  const updates: Array<{ id: string; appliedRule: string; previousStatus: number; nextStatus: number }> = [];
  const idsToUpdate: string[] = [];

  for (const row of rows) {
    const classification = classifyTitle(row.title ?? "");
    if (!classification) continue;

    const nextStatus = AUTO_STATUS_OK;

    const shouldUpdate = row.currentStatus !== nextStatus;
    if (!shouldUpdate) continue;

    idsToUpdate.push(row.id);

    updates.push({
      id: row.id,
      appliedRule: classification.key,
      previousStatus: row.currentStatus,
      nextStatus,
    });
  }

  if (idsToUpdate.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < idsToUpdate.length; i += chunkSize) {
      const chunk = idsToUpdate.slice(i, i + chunkSize);
      await db.update(videos).set({ status: AUTO_STATUS_OK }).where(inArray(videos.id, chunk));
    }
  }

  return { scanned: rows.length, updated: updates.length, results: updates.slice(0, 200) };
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
