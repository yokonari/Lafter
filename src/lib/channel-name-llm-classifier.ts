import OpenAI from "openai";

// 芸人・劇場の公式チャンネルかどうかを厳密に定義し、ネタ動画が投稿される可能性を丁寧に説明します。
const CHANNEL_PROMPT_HEADER = `あなたは日本のお笑い業界に詳しいチャンネル審査担当者です。目的: チャンネル名だけを読み取り、
「芸人本人またはお笑いプロダクション、またはお笑い劇場が運営しており、漫才/コント等のネタ動画が今後も追加される可能性が高いか」を判定することです。
必ず JSON 形式 {"isComedyChannel": true|false} で回答し、余計なキーや文章は一切含めないでください。

- true (isComedyChannel=true): 芸人・お笑いコンビ・芸能事務所公式ネタチャンネル・ライブ劇場公式チャンネルなど。
- false: 情報番組/ラジオ/切り抜き/ファンアカウント/ニュース/雑談配信/一般企業チャンネル/お笑い以外の劇場など。
- チャンネル名以外の情報は推測しない。判断に迷った場合は false を返すこと。
- 出力は JSON のみ。説明文・reason・confidence は禁止。`;

// サンプル名を few-shot として維持し、LLM へ望ましい判断基準を共有します。
const CHANNEL_FEW_SHOTS = [
  { name: "見取り図ディスカバリーチャンネル", isComedyChannel: true },
  { name: "大阪よしもと漫才博覧会", isComedyChannel: true },
  { name: "たつろう", isComedyChannel: true },
  { name: "ライブイイね", isComedyChannel: true },
  { name: "みかんチャンネル", isComedyChannel: true },
  { name: "森東", isComedyChannel: true },
  { name: "お笑いミント", isComedyChannel: false },
  { name: "Repezenkirinukimasuo", isComedyChannel: false },
  { name: "サンデージャポン【公式】", isComedyChannel: false },
  { name: "しくじり先生 俺みたいになるな!!【公式】", isComedyChannel: false },
  { name: "マイナビニュース【エンタメ・ホビー】", isComedyChannel: false },
];

const CHANNEL_FEW_SHOT_TEXT = CHANNEL_FEW_SHOTS.map(
  (shot, index) => `例${index + 1}: チャンネル名="${shot.name}" -> isComedyChannel=${shot.isComedyChannel}`,
).join("\n");

export type ChannelLLMClassification = {
  name: string;
  isComedyChannel: boolean;
  rawResponse: string;
};

export async function classifyChannelNameWithLLM(
  client: OpenAI,
  name: string,
): Promise<ChannelLLMClassification> {
  // API 呼び出しごとに few-shot を提示し、判定の一貫性を保ちます。
  const completion = await client.responses.create({
    model: "gpt-5-nano",
    input: [
      {
        role: "system",
        content: `${CHANNEL_PROMPT_HEADER}\n参考例:\n${CHANNEL_FEW_SHOT_TEXT}`,
      },
      {
        role: "user",
        content: `チャンネル名: ${name}`,
      },
    ],
    top_p: 1,
    text: { verbosity: "low" },
    reasoning: { effort: "low" },
  });
  const rawText = completion.output_text ?? "";
  const parsed = parseChannelJsonOutput(rawText);
  return {
    name,
    isComedyChannel: parsed.isComedyChannel,
    rawResponse: rawText,
  };
}

function parseChannelJsonOutput(text: string): { isComedyChannel: boolean } {
  // LLM 応答から JSON を抽出し、必須フィールドのみ厳格に検証します。
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("LLM応答がJSON形式ではありません。");
  }
  const json = JSON.parse(match[0]);
  if (typeof json.isComedyChannel !== "boolean") {
    throw new Error("isComedyChannel が boolean で返却されませんでした。");
  }
  return {
    isComedyChannel: json.isComedyChannel,
  };
}
