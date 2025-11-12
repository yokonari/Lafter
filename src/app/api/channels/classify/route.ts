import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getOpenAIClient } from "@/lib/openai-client";
import { classifyChannelNameWithLLM } from "@/lib/channel-name-llm-classifier";
import { channels } from "@/lib/schema";
import { createDatabase } from "@/app/api/[[...hono]]/context";
import { verifyApiSecret } from "@/lib/api-secret";

type ChannelClassifyRequestBody = {
  limit?: unknown;
};

const MAX_CHANNEL_NAMES = 30; // LLMコールを過度に増やさないよう、1リクエストあたりの件数を丁寧に制限します。

export async function POST(request: Request) {
  let body: ChannelClassifyRequestBody = {};
  try {
    body = (await request.json()) as ChannelClassifyRequestBody;
  } catch {
    // body は任意入力のため、JSON でない場合でも空オブジェクト扱いにして続行します。
  }

  const limit = resolveLimit(body);

  const { env } = getCloudflareContext();
  // 管理者専用エンドポイントなので共有シークレットを丁寧に検証します。
  const secretResult = verifyApiSecret(request.headers, env);
  if (!secretResult.ok) {
    return NextResponse.json({ message: secretResult.message }, { status: secretResult.status });
  }

  const db = createDatabase(env);

  // channels.status=0 のみを丁寧に対象とし、最古のものから順にLLM判定します。
  const pendingChannels = await db
    .select({
      id: channels.id,
      name: channels.name,
    })
    .from(channels)
    .where(eq(channels.status, 0))
    .orderBy(asc(channels.createdAt))
    .limit(limit);

  if (pendingChannels.length === 0) {
    return NextResponse.json(
      {
        mode: "llm",
        count: 0,
        results: [],
        message: "status=0 のチャンネルが存在しません。",
      },
      { status: 200 },
    );
  }

  const client = getOpenAIClient();
  if (!client) {
    return NextResponse.json(
      { message: "OpenAI APIキーが設定されていません。" },
      { status: 500 },
    );
  }

  const results = [];
  for (const channel of pendingChannels) {
    try {
      const classification = await classifyChannelNameWithLLM(client, channel.name);
      const nextStatus = resolveStatusFromFlag(classification.isComedyChannel);
      const checkedAt = new Date().toISOString();
      await db
        .update(channels)
        .set({
          status: nextStatus,
          lastChecked: checkedAt,
        })
        .where(eq(channels.id, channel.id));
      results.push({
        id: channel.id,
        name: classification.name,
        isComedyChannel: classification.isComedyChannel,
        nextStatus,
      });
    } catch (error) {
      // LLM 判定に失敗した際は status を変更せず、呼び出し元が状況を把握できるようエラー内容を丁寧に返却します。
      results.push({
        id: channel.id,
        name: channel.name,
        isComedyChannel: false,
        nextStatus: 0,
        error:
          error instanceof Error
            ? error.message
            : "LLM判定に失敗しました。",
      });
    }
  }

  return NextResponse.json({
    mode: "llm",
    count: results.length,
    results,
  });
}

function resolveLimit(body: ChannelClassifyRequestBody): number {
  // limit の指定が無い場合は MAX_CHANNEL_NAMES を用い、過度なバッチ実行を避けます。
  const rawLimit = body.limit;
  if (typeof rawLimit === "number" && Number.isInteger(rawLimit)) {
    return Math.min(Math.max(rawLimit, 1), MAX_CHANNEL_NAMES);
  }
  if (typeof rawLimit === "string") {
    const parsed = Number(rawLimit);
    if (Number.isInteger(parsed)) {
      return Math.min(Math.max(parsed, 1), MAX_CHANNEL_NAMES);
    }
  }
  return MAX_CHANNEL_NAMES;
}

function resolveStatusFromFlag(isComedyChannel: boolean): number {
  // LLM 判定の結果 true=3, false=4 としてチャンネルの自動判定ステータスを丁寧に反映します。
  return isComedyChannel ? 3 : 4;
}
