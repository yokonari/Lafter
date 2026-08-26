import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq, inArray } from "drizzle-orm";
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
type ExistingVideoRow = {
  id: string;
  status: number;
  channelId: string;
};
type NormalizedBulkItem = {
  videoId: string;
  videoStatus: number;
  reportStatus?: number;
  classificationDecision?: ClassificationDecision;
  channelId: string;
};

// few-shot キャッシュのキープレフィックス。classify/route.ts と同期を保つ必要があります。
const CHANNEL_FEW_SHOT_KV_PREFIX = "llm:few-shots:";
const D1_BATCH_SIZE = 100;

export function registerPostAdminVideoBulk(app: Hono<AdminEnv>) {
  app.post("/admin/video/bulk", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const fail = (message: string, status: ContentfulStatusCode = 400) =>
      c.json({ message }, status);

    let body: BulkRequestBody | BulkItem[];
    try {
      body = (await c.req.json()) as BulkRequestBody | BulkItem[];
    } catch {
      return fail("リクエスト本文を JSON として解釈できませんでした。");
    }

    // 管理画面経由の { items } と、配列を直接送る旧形式の両方を受け付けます。
    const items = Array.isArray(body)
      ? body
      : Array.isArray(body.items)
        ? body.items
        : [];
    if (items.length === 0) {
      return fail("更新対象の items が指定されていません。");
    }

    const videoIds = items.map((item, index) => {
      const path = `items[${index}]`;
      const videoId = typeof item.id === "string" ? item.id.trim() : "";
      if (!videoId) {
        throw new Error(`${path}.id は必須です。`);
      }
      return videoId;
    });

    let existingVideos: ExistingVideoRow[];
    try {
      existingVideos = await db
        .select({
          id: videos.id,
          status: videos.status,
          channelId: videos.channelId,
        })
        .from(videos)
        .where(inArray(videos.id, Array.from(new Set(videoIds))));
    } catch {
      return fail("動画情報の取得に失敗しました。", 500);
    }

    const existingVideoMap = new Map(existingVideos.map((row) => [row.id, row]));
    const normalizedItems: NormalizedBulkItem[] = [];
    // 人間の分類判断が変わったチャンネルだけfew-shotを更新します。
    const channelsNeedingFewShotRefresh = new Set<string>();

    for (const [index, item] of items.entries()) {
      const path = `items[${index}]`;
      const videoId = videoIds[index];
      const videoRow = existingVideoMap.get(videoId);
      if (!videoRow) {
        return fail(`${path}.id に該当する動画が存在しません。`);
      }

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

      // 報告ステータスの更新処理。指定があれば 0〜3 の範囲でバリデーションし、更新対象に含めます。
      let reportStatus = normalizeInt(item.report_status);
      if (reportStatus !== undefined && ![0, 1, 2, 3].includes(reportStatus)) {
          return fail(`${path}.report_status には 0〜3 の整数を指定してください。`);
      }
      if (classificationDecision === "unavailable") {
        // 削除・再生不可は非表示にしますが、ネタ以外の正解ラベルには含めません。
        reportStatus = 3;
      } else if (classificationDecision === "unofficial") {
        // 公式外の動画も公開対象から外しますが、内容自体のネタ判定には利用しません。
        reportStatus = 2;
      }

      // 人間のネタ判定が変わった場合だけfew-shotキャッシュを更新します。
      if (classificationDecision && videoRow.channelId) {
        channelsNeedingFewShotRefresh.add(videoRow.channelId);
      }

      normalizedItems.push({
        videoId,
        videoStatus,
        reportStatus,
        classificationDecision,
        channelId: videoRow.channelId,
      });
    }

    const isD1BatchAvailable = env.DB && typeof env.DB.batch === "function";
    const now = new Date().toISOString();

    if (isD1BatchAvailable) {
      const videoUpdateStatements = normalizedItems.map((item) => {
        if (item.reportStatus === undefined) {
          return env.DB.prepare(
            "UPDATE videos SET status = ? WHERE id = ?",
          ).bind(item.videoStatus, item.videoId);
        }
        return env.DB.prepare(
          "UPDATE videos SET status = ?, report_status = ? WHERE id = ?",
        ).bind(item.videoStatus, item.reportStatus, item.videoId);
      });

      await executeD1Batch(videoUpdateStatements, env.DB.batch.bind(env.DB));

      const labelStatements = normalizedItems.flatMap((item) => {
        if (item.classificationDecision === "ok" || item.classificationDecision === "not_content") {
          const label = item.classificationDecision === "ok" ? 1 : 0;
          return [
            env.DB.prepare(
              "INSERT INTO video_manual_labels (video_id, label, source, reviewed_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(video_id) DO UPDATE SET label = excluded.label, source = excluded.source, reviewed_at = excluded.reviewed_at, updated_at = excluded.updated_at",
            ).bind(item.videoId, label, "admin", now, now),
          ];
        }
        if (
          item.classificationDecision === "unavailable" ||
          item.classificationDecision === "unofficial"
        ) {
          return [
            env.DB.prepare("DELETE FROM video_manual_labels WHERE video_id = ?").bind(item.videoId),
          ];
        }
        return [];
      });

      try {
        await executeD1Batch(labelStatements, env.DB.batch.bind(env.DB));
      } catch (error) {
        // 手動ラベル同期が失敗しても一括更新自体は継続し、原因追跡用のログを残します。
        console.error("[admin/video/bulk] 手動ラベル同期に失敗しました。", {
          videoIds: normalizedItems.map((item) => item.videoId),
          error,
        });
      }
    } else {
      for (const item of normalizedItems) {
        const videoUpdates: Partial<VideoInsert> = {
          status: item.videoStatus,
        };
        if (item.reportStatus !== undefined) {
          videoUpdates.reportStatus = item.reportStatus;
        }
        await db.update(videos).set(videoUpdates).where(eq(videos.id, item.videoId));
      }

      try {
        for (const item of normalizedItems) {
          if (item.classificationDecision === "ok" || item.classificationDecision === "not_content") {
            const label = item.classificationDecision === "ok" ? 1 : 0;
            await db
              .insert(videoManualLabels)
              .values({
                videoId: item.videoId,
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
            item.classificationDecision === "unavailable" ||
            item.classificationDecision === "unofficial"
          ) {
            // 区分対象外への変更時は、過去の誤った手動ラベルを外します。
            await db.delete(videoManualLabels).where(eq(videoManualLabels.videoId, item.videoId));
          }
        }
      } catch (error) {
        // 手動ラベル同期が失敗しても一括更新自体は継続し、原因追跡用のログを残します。
        console.error("[admin/video/bulk] 手動ラベル同期に失敗しました。", {
          videoIds: normalizedItems.map((item) => item.videoId),
          error,
        });
      }
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
      processed: normalizedItems.length,
      fewShotRefreshedChannels: Array.from(channelsNeedingFewShotRefresh),
    }, 200);
  });
}

async function executeD1Batch<TStatement>(
  statements: TStatement[],
  batch: (statements: TStatement[]) => Promise<unknown>,
) {
  for (let i = 0; i < statements.length; i += D1_BATCH_SIZE) {
    await batch(statements.slice(i, i + D1_BATCH_SIZE));
  }
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
