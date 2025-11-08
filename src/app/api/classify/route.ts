import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asc, eq } from "drizzle-orm";
import { CLASSIFIER_THRESHOLD, classifyTitle } from "@/lib/video-classifier";
import { getOpenAIClient } from "@/lib/openai-client";
import { classifyTitleWithLLM, type LLMClassification } from "@/lib/llm-classifier";
import { videos } from "@/lib/schema";
import { createDatabase } from "@/app/api/[[...hono]]/context";

type ClassifyRequestBody = {
  title?: unknown;
  titles?: unknown;
  useLLM?: unknown;
  mode?: unknown;
};

const MAX_TITLES = 100; // 過負荷を避けるため、1リクエストあたり/1回のDBバッチ取得件数を丁寧に制限します。

type LLMResultPayload = {
  title: string;
  label: number;
  videoId: string;
  nextStatus: number;
};

export async function POST(request: Request) {
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
    const { env } = getCloudflareContext();
    const db = createDatabase(env);
    const pendingVideos = await db
      .select({ id: videos.id, title: videos.title })
      .from(videos)
      .where(eq(videos.status, 0))
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
        llmResults.push({
          title: video.title,
          label: 0,
          videoId: video.id,
          nextStatus: 0,
        });
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

function resolveStatusFromLabel(label: number): number {
  // LLM の結果 1=ネタ/0=それ以外 を、videos.status (1=OK, 2=NG) に丁寧にマッピングします。
  return label === 1 ? 1 : 2;
}
