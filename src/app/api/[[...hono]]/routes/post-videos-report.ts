import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { videos } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

type ReportRequest = {
  videoId?: unknown;
  report_status?: unknown;
};

const ACCEPTABLE_STATUS = new Set([1, 2, 3]);

export function registerPostVideosReport(app: Hono<AdminEnv>) {
  app.post("/videos/report", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const fail = (message: string, status: ContentfulStatusCode = 400) => c.json({ message }, status);

    let payload: ReportRequest;
    try {
      payload = (await c.req.json()) as ReportRequest;
    } catch {
      return fail("リクエスト本文を JSON として解釈できませんでした。", 400);
    }

    const rawVideoId = typeof payload.videoId === "string" ? payload.videoId.trim() : "";
    const rawStatus = payload.report_status;
    const parsedStatus =
      typeof rawStatus === "number"
        ? rawStatus
        : typeof rawStatus === "string" && rawStatus.trim()
          ? Number.parseInt(rawStatus, 10)
          : Number.NaN;

    if (!rawVideoId) {
      return fail("videoId は必須です。", 400);
    }

    if (!ACCEPTABLE_STATUS.has(parsedStatus)) {
      return fail("report_status には 1〜3 の整数を指定してください。", 400);
    }

    try {
      const existing = await db
        .select({ id: videos.id })
        .from(videos)
        .where(eq(videos.id, rawVideoId))
        .limit(1);

      if (existing.length === 0) {
        return fail("指定された動画が見つかりません。", 404);
      }

      // 報告を受けた動画について report_status を丁寧に更新します。
      await db
        .update(videos)
        .set({ reportStatus: parsedStatus })
        .where(eq(videos.id, rawVideoId));

      return c.json({ ok: true }, 200);
    } catch (error) {
      console.error("Failed to save report", error);
      return fail("報告の保存に失敗しました。", 500);
    }
  });
}
