import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { videoManualLabels, videos } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

type BulkItem = {
  id?: unknown;
  video_status?: unknown;
  report_status?: unknown;
  classification_decision?: unknown;
};

type ClassificationDecision = "ok" | "not_content" | "unofficial" | "unavailable";

type BulkRequestBody = {
  items?: BulkItem[];
};

type VideoInsert = typeof videos.$inferInsert;

// few-shot キャッシュのキープレフィックス。classify/route.ts と同期を保つ必要があります。
const CHANNEL_FEW_SHOT_KV_PREFIX = "llm:few-shots:";

export function registerPostAdminVideoBulk(app: Hono<AdminEnv>) {
  app.post("/admin/video/bulk", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const fail = (message: string, status: ContentfulStatusCode = 400) =>
      c.json({ message }, status);

    let body: BulkRequestBody;
    try {
      body = (await c.req.json()) as BulkRequestBody;
    } catch {
      return fail("リクエスト本文を JSON として解釈できませんでした。");
    }

    // ご指定いただいた配列をそのまま丁寧にお預かりし、100件超でも漏れなく処理いたします。
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return fail("更新対象の items が指定されていません。");
    }

    let processed = 0;
    // 人間の分類判断が変わったチャンネルだけfew-shotを更新します。
    const channelsNeedingFewShotRefresh = new Set<string>();

    for (const [index, item] of items.entries()) {
      const path = `items[${index}]`;
      const videoId = typeof item.id === "string" ? item.id.trim() : "";
      if (!videoId) {
        return fail(`${path}.id は必須です。`);
      }

      const [videoRow] = await db
        .select({
          id: videos.id,
          status: videos.status,
          channelId: videos.channelId,
        })
        .from(videos)
        .where(eq(videos.id, videoId))
        .limit(1);

      if (!videoRow) {
        return fail(`${path}.id に該当する動画が存在しません。`);
      }

      const videoUpdates: Partial<VideoInsert> = {};

      const rawDecision = item.classification_decision;
      const explicitDecision = normalizeClassificationDecision(rawDecision);
      if (rawDecision !== undefined && !explicitDecision) {
        return fail(
          `${path}.classification_decision には ok / not_content / unofficial / unavailable を指定してください。`,
        );
      }

      const requestedVideoStatus = normalizeInt(item.video_status);
      const classificationDecision = explicitDecision ?? resolveDecisionFromStatusChange(
        videoRow.status,
        requestedVideoStatus,
      );
      const videoStatus = classificationDecision
        ? resolveVideoStatusFromDecision(classificationDecision)
        : requestedVideoStatus;
      if (videoStatus === undefined || ![0, 1, 2, 3, 4].includes(videoStatus)) {
        return fail(`${path}.video_status には 0〜4 の整数を指定してください。`);
      }
      videoUpdates.status = videoStatus;

      // 報告ステータスの更新処理。指定があれば 0〜3 の範囲でバリデーションし、更新対象に含めます。
      const reportStatus = normalizeInt(item.report_status);
      if (reportStatus !== undefined) {
        if (![0, 1, 2, 3].includes(reportStatus)) {
          return fail(`${path}.report_status には 0〜3 の整数を指定してください。`);
        }
        videoUpdates.reportStatus = reportStatus;
      }
      if (classificationDecision === "unavailable") {
        // 削除・再生不可は非表示にしますが、ネタ以外の正解ラベルには含めません。
        videoUpdates.reportStatus = 3;
      } else if (classificationDecision === "unofficial") {
        // 公式外の動画も公開対象から外しますが、内容自体のネタ判定には利用しません。
        videoUpdates.reportStatus = 2;
      }

      // 人間のネタ判定が変わった場合だけfew-shotキャッシュを更新します。
      if (classificationDecision && videoRow.channelId) {
        channelsNeedingFewShotRefresh.add(videoRow.channelId);
      }

      if (Object.keys(videoUpdates).length > 0) {
        await db.update(videos).set(videoUpdates).where(eq(videos.id, videoId));
      }

      if (classificationDecision === "ok" || classificationDecision === "not_content") {
        const now = new Date().toISOString();
        const label = classificationDecision === "ok" ? 1 : 0;
        await db
          .insert(videoManualLabels)
          .values({
            videoId,
            label,
            source: "admin",
            reviewedAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: videoManualLabels.videoId,
            set: {
              label,
              source: "admin",
              reviewedAt: now,
              updatedAt: now,
            },
          });
      } else if (
        classificationDecision === "unavailable" ||
        classificationDecision === "unofficial"
      ) {
        // 区分対象外への変更時は、過去の誤った手動ラベルを外します。
        await db.delete(videoManualLabels).where(eq(videoManualLabels.videoId, videoId));
      }

      processed += 1;
    }

    // 正解ラベルを変更したチャンネルのfew-shotを次回判定時に再構築します。
    if (channelsNeedingFewShotRefresh.size > 0 && env.LAFTER) {
      for (const channelId of channelsNeedingFewShotRefresh) {
        const key = `${CHANNEL_FEW_SHOT_KV_PREFIX}${channelId}`;
        try {
          await env.LAFTER.delete(key);
          console.log(`[admin/video/bulk] few-shot キャッシュを削除しました: ${key}`);
        } catch (error) {
          console.error(`[admin/video/bulk] few-shot キャッシュ削除に失敗: ${key}`, error);
        }
      }
    }

    // まとめて更新した件数を丁寧にお知らせいたします。
    return c.json({
      success: true,
      processed,
      fewShotRefreshedChannels: Array.from(channelsNeedingFewShotRefresh),
    }, 200);
  });
}

function normalizeInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return undefined;
}

function normalizeClassificationDecision(value: unknown): ClassificationDecision | undefined {
  if (
    value === "ok" ||
    value === "not_content" ||
    value === "unofficial" ||
    value === "unavailable"
  ) {
    return value;
  }
  return undefined;
}

function resolveVideoStatusFromDecision(decision: ClassificationDecision): number {
  return decision === "ok" ? 1 : 2;
}

function resolveDecisionFromStatusChange(
  currentStatus: number,
  requestedStatus: number | undefined,
): ClassificationDecision | undefined {
  // 管理画面でOK/NGへ確定する既存操作も、人間の正解ラベルとして記録します。
  if (requestedStatus === currentStatus) {
    return undefined;
  }
  if (requestedStatus === 1) {
    return "ok";
  }
  if (requestedStatus === 2) {
    return "not_content";
  }
  return undefined;
}
