import OpenAI from "openai";

const PROMPT_HEADER = `あなたはお笑い動画タイトルの分類専門家です。
- 目的: タイトルが「ネタ動画（漫才/コントなど本編）」かどうかを判定。
- 応答は必ず {"label":0|1,"confidence":0〜1,"reason":"..."} の json 形式。
- confidence は 0〜1 の数値で、迷う場合は 0.4 など低めにしてください。
- reason は根拠となる語やニュアンスを日本語で 20 文字以内に圧縮し、「配信タイトル」「ネタ本編」など簡潔なフレーズで書いてください。
- タイトル以外の情報を推測しないこと。`;

const FEW_SHOTS = [
  { title: "【コント】面白すぎて生徒人気No.1の先生", label: 1 },
  { title: "レインボー【キレイだ】", label: 1 },
  { title: "四千頭身「駅伝」", label: 1 },
  { title: "【ベーキング】中田ブチギレ問題【short】", label: 0 },
  { title: "千原せいじにタメ口で失礼な事言いまくった", label: 0 },
  { title: "【ラブトラ３】最終話を振り返る【全話ネタバレあり】", label: 0 },
];

const FEW_SHOT_TEXT = FEW_SHOTS.map(
  (shot, index) => `例${index + 1}: タイトル="${shot.title}" -> label=${shot.label}`,
).join("\n");

export type LLMClassification = {
  title: string;
  label: number;
  confidence: number;
  reason: string;
  rawResponse: string;
};

export async function classifyTitleWithLLM(
  client: OpenAI,
  title: string,
): Promise<LLMClassification> {
  const completion = await client.responses.create({
    model: "gpt-5-nano",
    input: [
      {
        role: "system",
        content: `${PROMPT_HEADER}\n参考例:\n${FEW_SHOT_TEXT}`,
      },
      {
        role: "user",
        content: `タイトル: ${title}`,
      },
    ],
    top_p: 1,
    text: { verbosity: "low" },
    reasoning: { effort: "low" },
  });
  const rawText = completion.output_text ?? "";
  const parsed = parseJsonOutput(rawText);
  return {
    title,
    label: parsed.label,
    confidence: parsed.confidence,
    reason: parsed.reason,
    rawResponse: rawText,
  };
}

function parseJsonOutput(text: string): {
  label: number;
  confidence: number;
  reason: string;
} {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("LLM応答がJSON形式ではありません。");
  }
  const json = JSON.parse(match[0]);
  const label = Number(json.label);
  const confidence = Number(json.confidence ?? 0);
  const reason =
    typeof json.reason === "string" && json.reason.trim() !== ""
      ? json.reason.trim()
      : text;
  if (!Number.isFinite(label) || (label !== 0 && label !== 1)) {
    throw new Error("label が 0/1 で返却されませんでした。");
  }
  return {
    label,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    reason,
  };
}

function isValidParsed(value: Record<string, unknown>): value is {
  label: number;
  confidence: number;
  reason: string;
} {
  if (!value) {
    return false;
  }
  const { label, confidence, reason } = value as Record<string, unknown>;
  return (
    typeof label === "number" &&
    (confidence === undefined || typeof confidence === "number") &&
    typeof reason === "string"
  );
}
