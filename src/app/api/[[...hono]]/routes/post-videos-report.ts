import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { videos } from "@/lib/schema";
import { parseLimitedJson, protectPublicPost } from "@/lib/public-api-security";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

type ReportRequest = {
  videoId?: unknown;
  report_status?: unknown;
};

const ACCEPTABLE_STATUS = new Set([1, 2, 3]);
const MAX_BODY_BYTES = 1_024;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function registerPostVideosReport(app: Hono<AdminEnv>) {
  app.post("/videos/report", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const securityResponse = await protectPublicPost(c.req.raw, env.LAFTER, {
      namespace: "video-report",
      limit: 10,
      windowSeconds: 60 * 60,
      maxBodyBytes: MAX_BODY_BYTES,
    });
    if (securityResponse) return securityResponse;

    const fail = (message: string, status: ContentfulStatusCode = 400) => c.json({ message }, status);

    const parsedBody = await parseLimitedJson<ReportRequest>(c.req.raw, MAX_BODY_BYTES);
    if (!parsedBody.ok) return parsedBody.response;
    const payload = parsedBody.value;

    const rawVideoId = typeof payload.videoId === "string" ? payload.videoId.trim() : "";
    const rawStatus = payload.report_status;
    const parsedStatus =
      typeof rawStatus === "number"
        ? rawStatus
        : typeof rawStatus === "string" && rawStatus.trim()
          ? Number.parseInt(rawStatus, 10)
          : Number.NaN;

    if (!VIDEO_ID_PATTERN.test(rawVideoId)) {
      return fail("videoId の形式が正しくありません。", 400);
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

      // 最初の報告だけを採用し、公開APIから既存の報告理由を上書きさせません。
      await db
        .update(videos)
        .set({ reportStatus: parsedStatus })
        .where(and(eq(videos.id, rawVideoId), eq(videos.reportStatus, 0)));

      return c.json({ ok: true }, 200);
    } catch (error) {
      console.error("Failed to save report", error);
      return fail("報告の保存に失敗しました。", 500);
    }
  });
}
