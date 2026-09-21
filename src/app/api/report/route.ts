// 報告内容を Resend 経由でメール送信するエンドポイントです。
import { Resend } from "resend";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { ReportReasonKey } from "@/lib/reportReasons";
import { parseLimitedJson, protectPublicPost } from "@/lib/public-api-security";

type ReportPayload = {
  videoId?: unknown;
  videoTitle?: unknown;
  channelId?: unknown;
  channelName?: unknown;
  reason?: unknown;
};

type ReportResponse = {
  ok: true;
};

const REASON_LABELS: Record<ReportReasonKey, string> = {
  not_funny: "ネタ動画ではない",
  not_official_video: "公式動画ではない",
  // 再生不能な動画の報告も確実にラベルを付けて受付します。
  cannot_play: "再生できない",
};

const MAX_BODY_BYTES = 4_096;
const MAX_TITLE_LENGTH = 300;
const MAX_CHANNEL_NAME_LENGTH = 200;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  const { env } = getCloudflareContext();
  const securityResponse = await protectPublicPost(req, env.LAFTER, {
    namespace: "report-email",
    limit: 10,
    windowSeconds: 60 * 60,
    maxBodyBytes: MAX_BODY_BYTES,
  });
  if (securityResponse) return securityResponse;

  const apiKey = env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL;
  const to = env.CONTACT_TO_EMAIL ?? process.env.CONTACT_TO_EMAIL;

  const missingKeys = [
    !apiKey && "RESEND_API_KEY",
    !from && "RESEND_FROM_EMAIL",
    !to && "CONTACT_TO_EMAIL",
  ].filter((v): v is string => typeof v === "string");

  if (missingKeys.length > 0) {
    console.error("Report API misconfiguration", { missingKeys });
    return json(500, {
      message: "報告の送信に失敗しました。時間を置いて再度お試しください。",
    });
  }

  const parsedBody = await parseLimitedJson<ReportPayload>(req, MAX_BODY_BYTES);
  if (!parsedBody.ok) return parsedBody.response;
  const payload = parsedBody.value;

  const videoId = typeof payload.videoId === "string" ? payload.videoId.trim() : "";
  const videoTitle = typeof payload.videoTitle === "string" ? payload.videoTitle.trim() : "";
  const channelId = typeof payload.channelId === "string" ? payload.channelId.trim() : "";
  const channelName = typeof payload.channelName === "string" ? payload.channelName.trim() : "";
  const reasonRaw = typeof payload.reason === "string" ? payload.reason : "";

  if (!videoTitle) {
    return json(400, { message: "動画情報が不足しています。" });
  }

  if (
    videoTitle.length > MAX_TITLE_LENGTH ||
    channelName.length > MAX_CHANNEL_NAME_LENGTH ||
    (videoId && !VIDEO_ID_PATTERN.test(videoId)) ||
    (channelId && !CHANNEL_ID_PATTERN.test(channelId))
  ) {
    return json(400, { message: "動画情報の形式が正しくありません。" });
  }

  if (!Object.keys(REASON_LABELS).includes(reasonRaw)) {
    return json(400, { message: "不正な報告種別です。" });
  }

  const reasonKey = reasonRaw as ReportReasonKey;
  const reasonLabel = REASON_LABELS[reasonKey];

  const subject = "【Lafter】動画報告";
  const summary = [
    `報告種別: ${reasonLabel}`,
    `動画名: ${videoTitle}`,
    `チャンネル名: ${channelName || "未入力"}`,
    `動画ID: ${videoId || "未入力"}`,
    `チャンネルID: ${channelId || "未入力"}`,
  ].join("\n");

  const ensuredApiKey = apiKey as string;
  const ensuredFrom = from as string;
  const ensuredTo = to as string;
  const resend = new Resend(ensuredApiKey);

  try {
    await resend.emails.send({
      from: `Lafter <${ensuredFrom}>`,
      to: ensuredTo.split(",").map((address) => address.trim()).filter(Boolean),
      subject,
      text: summary,
    });
  } catch (error) {
    console.error("Failed to send report via Resend", error);
    return json(502, { message: "報告の送信に失敗しました。時間を置いて再度お試しください。" });
  }

  const response: ReportResponse = { ok: true };
  return json(200, response);
}
