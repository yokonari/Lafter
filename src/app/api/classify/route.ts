import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, asc, eq } from "drizzle-orm";
import { CLASSIFIER_THRESHOLD, classifyTitle } from "@/lib/video-classifier";
import { getOpenAIClient } from "@/lib/openai-client";
import { classifyTitleWithLLM } from "@/lib/llm-classifier";
import { channels, videos } from "@/lib/schema";
import { createDatabase } from "@/app/api/[[...hono]]/context";
import { verifyApiSecret } from "@/lib/api-secret";

type ClassifyRequestBody = {
  title?: unknown;
  titles?: unknown;
  useLLM?: unknown;
  mode?: unknown;
};

const MAX_TITLES = 50; // 過負荷を避けるため、1リクエストあたり/1回のDBバッチ取得件数を丁寧に制限します。

type LLMResultPayload = {
  title: string;
  label: "true" | "false";
  videoId: string;
  nextStatus: number;
};

export async function POST(request: Request) {
  const { env } = getCloudflareContext();
  // 管理者専用エンドポイントのため、共有シークレットを丁寧に検証します。
  const secretResult = verifyApiSecret(request.headers, env);
  if (!secretResult.ok) {
    return Response.json({ message: secretResult.message }, { status: secretResult.status });
  }

  let body: ClassifyRequestBody;
  try {
    body = (await request.json()) as ClassifyRequestBody;
  } catch {
    return Response.json(
      { message: "リクエスト本文をJSONとして解釈できませんでした。" },
      { status: 400 },
    );
  }

  const useLLM = shouldUseLLM(body);
  const titles = extractTitles(body);

  // しきい値と併せて推論結果を整形し、分かりやすく返却いたします。
  if (useLLM) {
    const client = getOpenAIClient();
    if (!client) {
      return Response.json(
        { message: "OpenAI APIキーが設定されていません。" },
        { status: 500 },
      );
    }
    // Cloudflare D1 から status=0 の動画だけを取得し、LLM 判定キューを作成します。
    const db = createDatabase(env);
    // status=0 かつ所属チャンネルが有効(status=1)な動画のみをキューに乗せ、不要なLLMリクエストを避けます。
    const pendingVideos = await db
      .select({ id: videos.id, title: videos.title })
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(and(eq(videos.status, 0), eq(channels.status, 1)))
      .orderBy(asc(videos.createdAt))
      .limit(MAX_TITLES);

    if (pendingVideos.length === 0) {
      return Response.json({
        mode: "llm",
        count: 0,
        results: [],
        message: "status=0 の動画が存在しません。",
      });
    }

    const llmResults: LLMResultPayload[] = [];
    let processed = 0;
    for (const video of pendingVideos) {
      try {
        const classification = await classifyTitleWithLLM(client, video.title);
        const nextStatus = resolveStatusFromLabel(classification.label);
        const checkedAt = new Date().toISOString();
        await db
          .update(videos)
          .set({
            status: nextStatus,
            lastCheckedAt: checkedAt,
          })
          .where(eq(videos.id, video.id));
        // confidence/reason は API 応答では不要なため、label のみを動画IDと共に返します。
        llmResults.push({
          title: classification.title,
          label: classification.label,
          videoId: video.id,
          nextStatus,
        });
      } catch (error) {
        console.error("[api/classify] LLM 判定中にエラーが発生しました。", error);
        llmResults.push({
          title: video.title,
          label: "false",
          videoId: video.id,
          nextStatus: 0,
        });
      }
      processed += 1;
      // LLM 判定の進捗を 10 件ごとに丁寧にログへ出し、ロングバッチでも状況を把握しやすくします。
      if (processed % 10 === 0 || processed === pendingVideos.length) {
        console.log(`[api/classify] LLM判定 ${processed}/${pendingVideos.length} 件完了`);
      }
    }
    return Response.json({
      mode: "llm",
      count: llmResults.length,
      results: llmResults,
    });
  }

  if (titles.length === 0) {
    return Response.json(
      { message: "title もしくは titles に1件以上の文字列を指定してください。" },
      { status: 400 },
    );
  }
  if (titles.length > MAX_TITLES) {
    return Response.json(
      { message: `一度に処理できる件数は ${MAX_TITLES} 件までです。` },
      { status: 400 },
    );
  }

  const results = titles.map((title) => classifyTitle(title));

  return Response.json({
    threshold: CLASSIFIER_THRESHOLD,
    count: results.length,
    results: results.map((result) => ({
      title: result.title,
      normalizedTitle: result.normalizedTitle,
      probability: result.probability,
      label: result.label,
    })),
  });
}

function extractTitles(body: ClassifyRequestBody): string[] {
  // title/titles の両方を丁寧に許容し、文字列のみを抽出します。
  const titles: string[] = [];
  if (typeof body.title === "string") {
    titles.push(body.title);
  }
  if (Array.isArray(body.titles)) {
    for (const entry of body.titles) {
      if (typeof entry === "string") {
        titles.push(entry);
      }
    }
  }
  return titles
    .map((title) => title.trim())
    .filter((title) => title.length > 0);
}

function shouldUseLLM(body: ClassifyRequestBody): boolean {
  const flag = body as Record<string, unknown>;
  if (typeof flag.useLLM === "boolean") {
    return flag.useLLM;
  }
  if (typeof flag.useLLM === "string") {
    return flag.useLLM.toLowerCase() === "true";
  }
  if (typeof flag.mode === "string") {
    return flag.mode.toLowerCase() === "llm";
  }
  return false;
}

function resolveStatusFromLabel(label: "true" | "false"): number {
  // LLM の結果 true=ネタ/false=それ以外 を、videos.status (3=LLM OK, 4=LLM NG) に丁寧にマッピングします。
  return label === "true" ? 3 : 4;
}
