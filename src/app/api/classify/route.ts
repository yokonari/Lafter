import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, desc, eq } from "drizzle-orm";
import { CLASSIFIER_THRESHOLD, classifyTitle } from "@/lib/video-classifier";
import { getOpenAIClient } from "@/lib/openai-client";
import { classifyTitleWithLLM, type FewShotExample } from "@/lib/llm-classifier";
import { channels, videos } from "@/lib/schema";
import { createDatabase, type AppDatabase } from "@/app/api/[[...hono]]/context";
import { verifyApiSecret } from "@/lib/api-secret";
import type { KVNamespace } from "@cloudflare/workers-types";

type ClassifyRequestBody = {
  title?: unknown;
  titles?: unknown;
  useLLM?: unknown;
  mode?: unknown;
  channelId?: unknown;
  exhaustive?: unknown;
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
  const channelId = extractChannelId(body);
  const exhaustive = shouldLoopExhaustively(body);

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
    // status=0 かつ所属チャンネルが有効(status=1)な動画のみをキューに乗せ、不要なLLMリクエストを避けます。チャンネル指定があればその範囲だけに絞ります。
    let baseCondition = and(eq(videos.status, 0), eq(channels.status, 1));
    if (channelId) {
      baseCondition = and(baseCondition, eq(videos.channelId, channelId));
    }

    const llmResults: LLMResultPayload[] = [];
    // KV からの few-shot 読み出し頻度を抑えるため、チャンネル単位に丁寧なキャッシュを設けます。
    const fewShotCache = new Map<string, FewShotExample[]>();
    let processed = 0;
    // channel status=1 & video status=0 の範囲から、公開日の新しい順に 50 件のみ抽出します。
    const pendingVideos = await db
      .select({ id: videos.id, title: videos.title, channelId: videos.channelId })
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(baseCondition)
      .orderBy(desc(videos.publishedAt))
      .limit(MAX_TITLES);

    if (pendingVideos.length === 0) {
      return Response.json({
        mode: "llm",
        count: 0,
        results: [],
        message: "status=0 の動画が存在しません。",
      });
    }

    for (const video of pendingVideos) {
      const channelFewShots = await ensureChannelFewShots({
        channelId: video.channelId,
        kv: env.LAFTER,
        cache: fewShotCache,
        db,
      });
      try {
        const classification = await classifyTitleWithLLM(client, video.title, {
          fewShots: channelFewShots,
        });
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
      if (processed % 10 === 0 || processed === llmResults.length) {
        console.log(`[api/classify] LLM判定 ${processed} 件処理済み (最新50件対象)`);
      }
    }

    return Response.json({
      mode: "llm",
      count: llmResults.length,
      results: llmResults,
      meta: {
        channelId,
        loops: 1,
        exhaustive,
      },
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

function extractChannelId(body: ClassifyRequestBody): string | undefined {
  if (typeof body.channelId !== "string") return undefined;
  const trimmed = body.channelId.trim();
  return trimmed ? trimmed : undefined;
}

function shouldLoopExhaustively(body: ClassifyRequestBody): boolean {
  const flag = (body as Record<string, unknown>)?.exhaustive;
  if (typeof flag === "boolean") return flag;
  if (typeof flag === "string") {
    const normalized = flag.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

function resolveStatusFromLabel(label: "true" | "false"): number {
  // LLM の結果 true=ネタ/false=それ以外 を、videos.status (3=LLM OK, 4=LLM NG) に丁寧にマッピングします。
  return label === "true" ? 3 : 4;
}

const CHANNEL_FEW_SHOT_KV_PREFIX = "llm:few-shots:";
const FEW_SHOT_LIMIT_PER_LABEL = 12;
const FEW_SHOT_TRUE_STATUS = 1;
const FEW_SHOT_FALSE_STATUS = 2;
// KV にキャッシュした few-shot は 30 日に 1 度の頻度で丁寧に更新し、新鮮なサンプルを使い続けます。
const FEW_SHOT_REFRESH_INTERVAL_MS = 1000 * 60 * 60 * 24 * 30;

type ChannelFewShotRecord = {
  channelId: string;
  fewShots: FewShotExample[];
  updatedAt: string;
};

type LoadedFewShotRecord = {
  fewShots: FewShotExample[];
  updatedAt?: string;
};

type FewShotCacheParams = {
  channelId: string;
  kv?: KVNamespace;
  cache: Map<string, FewShotExample[]>;
  db: AppDatabase;
};

async function ensureChannelFewShots({
  channelId,
  kv,
  cache,
  db,
}: FewShotCacheParams): Promise<FewShotExample[] | undefined> {
  if (cache.has(channelId)) {
    return cache.get(channelId);
  }
  let kvShots: LoadedFewShotRecord | null = null;
  if (kv) {
    kvShots = await loadChannelFewShotsFromKv(kv, channelId);
    if (kvShots && !isFewShotRecordStale(kvShots.updatedAt)) {
      cache.set(channelId, kvShots.fewShots);
      return kvShots.fewShots;
    }
  }
  // KV に存在しない、もしくは期限切れの場合は DB から最新の few-shot を丁寧に再構築します。
  const dbShots = await buildFewShotsFromDatabase(db, channelId);
  if (dbShots.length === 0) {
    if (kvShots) {
      // DB に十分な確定サンプルが無い場合は、期限切れでも過去の few-shot を一時的に再利用し、判定不能を避けます。
      cache.set(channelId, kvShots.fewShots);
      return kvShots.fewShots;
    }
    return undefined;
  }
  cache.set(channelId, dbShots);
  if (kv) {
    await saveChannelFewShotsToKv(kv, channelId, dbShots);
  }
  return dbShots;
}

async function loadChannelFewShotsFromKv(
  kv: KVNamespace,
  channelId: string,
): Promise<LoadedFewShotRecord | null> {
  const key = `${CHANNEL_FEW_SHOT_KV_PREFIX}${channelId}`;
  try {
    // 既に生成済みの few-shot があれば JSON 経由で丁寧に再利用します。
    const payload = await kv.get<ChannelFewShotRecord>(key, { type: "json" });
    if (!payload) {
      return null;
    }
    const normalized = normalizeFewShots(payload.fewShots);
    if (!normalized) {
      return null;
    }
    return { fewShots: normalized, updatedAt: payload.updatedAt };
  } catch (error) {
    console.error("[api/classify] KV から few-shot を取得できませんでした。", {
      channelId,
      key,
      error,
    });
    return null;
  }
}

async function saveChannelFewShotsToKv(
  kv: KVNamespace,
  channelId: string,
  fewShots: FewShotExample[],
): Promise<void> {
  const key = `${CHANNEL_FEW_SHOT_KV_PREFIX}${channelId}`;
  const payload: ChannelFewShotRecord = {
    channelId,
    fewShots,
    updatedAt: new Date().toISOString(),
  };
  try {
    // DB から構築した参照例は KV にも保存し、以降の呼び出しを効率化します。
    await kv.put(key, JSON.stringify(payload));
  } catch (error) {
    console.error("[api/classify] KV への few-shot 保存に失敗しました。", {
      channelId,
      key,
      error,
    });
  }
}

async function buildFewShotsFromDatabase(db: AppDatabase, channelId: string): Promise<FewShotExample[]> {
  // LLM に確信度の高いシグナルを与えるため、手動で確定済み (status=1,2) の動画タイトルを丁寧に抽出します。
  const trueSamples = await selectVideoTitlesByStatus(db, channelId, FEW_SHOT_TRUE_STATUS);
  const falseSamples = await selectVideoTitlesByStatus(db, channelId, FEW_SHOT_FALSE_STATUS);
  const normalized = [
    ...trueSamples.map((row) => ({ title: row.title, label: "true" as const })),
    ...falseSamples.map((row) => ({ title: row.title, label: "false" as const })),
  ];
  return normalizeFewShots(normalized) ?? [];
}

async function selectVideoTitlesByStatus(
  db: AppDatabase,
  channelId: string,
  status: number,
): Promise<{ title: string }[]> {
  return db
    .select({ title: videos.title })
    .from(videos)
    .where(and(eq(videos.channelId, channelId), eq(videos.status, status)))
    .orderBy(desc(videos.publishedAt), desc(videos.createdAt))
    .limit(FEW_SHOT_LIMIT_PER_LABEL);
}

function normalizeFewShots(entries: FewShotExample[] | undefined | null): FewShotExample[] | null {
  if (!Array.isArray(entries)) {
    return null;
  }
  const normalized: FewShotExample[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry.title !== "string" || typeof entry.label !== "string") {
      continue;
    }
    const label = entry.label.toLowerCase().trim();
    if (label !== "true" && label !== "false") {
      continue;
    }
    normalized.push({ title: entry.title, label });
  }
  return normalized.length > 0 ? normalized : null;
}

function isFewShotRecordStale(updatedAt: string | undefined): boolean {
  if (!updatedAt) {
    return true;
  }
  const timestamp = Date.parse(updatedAt);
  if (Number.isNaN(timestamp)) {
    return true;
  }
  // 期限を過ぎていない場合のみ fresh とみなします。それ以外は再構築対象です。
  return Date.now() - timestamp >= FEW_SHOT_REFRESH_INTERVAL_MS;
}
