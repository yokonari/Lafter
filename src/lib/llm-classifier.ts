import OpenAI from "openai";

const PROMPT_HEADER = `あなたは「お笑い動画のタイトル」を分類する専門家です。目的: タイトルが「ネタ動画（漫才・コントなどの本編）」かどうかを判定すること。必ず json 形式 {"label":0|1} で応答し、余計なキーは一切追加しないでください。

- label: 1=ネタ動画 (コント/漫才など演目本編), 0=それ以外（告知/配信/雑談/切り抜き 等）。
- confidence や reason といった追加情報は出力しないでください。
- タイトル以外の情報を推測しない。迷う場合は 0 を返し、「label」以外のテキストは含めないこと。
`;

// scripts/classify_titles_with_llm.mjs の fewShots と同一内容に揃え、LLMへの参照例を丁寧に同期させます。
const FEW_SHOTS = [
  { title: "【コント】面白すぎて生徒人気No.1の先生", label: 1 },
  { title: "レインボー【キレイだ】", label: 1 },
  { title: "同棲して10年、会話少ないけどちゃんと仲良しなカップル", label: 1 },
  { title: "ジェラードン「人見知り」【公式】", label: 1 },
  { title: "お見合いでお互いナシすぎて、逆に仲良くなった【ジェラードン】", label: 1 },
  { title: "春とヒコーキ土岡　落語「疝気の虫」", label: 1 },
  { title: "終電後バイト先の店長の家にきてしまった女の子", label: 1 },
  { title: "20代女子から絶大な人気を誇る恋愛リアリティーショーに“ありそう”な神回", label: 1 },
  { title: "漫才「カラオケ」【霜降り明星】7/100", label: 1 },
  { title: "カフェ", label: 1 },
  { title: "パンダ", label: 1 },
  { title: "四千頭身「昨日の晩ごはん」", label: 1 },
  { title: "四千頭身「駅伝」", label: 1 },
  { title: "イイね(笑)ライブ！１０月大会！第1位★ラランド★", label: 1 },
  { title: "【ベーキング】中田ブチギレ問題【short】", label: 0 },
  { title: "ウエスPも参加!18歳から大人! ゆりやんとつくるラップ動画チャレンジ", label: 0 },
  { title: "ほんとうにあった怖くもないし意味がわからない話", label: 1 },
  { title: "同期のネタで好きなくだり。【9番街レトロ】#アックスボンバー", label: 0 },
  { title: "千原せいじにタメ口で失礼な事言いまくった", label: 0 },
  { title: "【サワガニ】見つける速さ、しかし／佐久間一行＆はいじぃ", label: 0 },
  { title: "DB芸人 キャラ台詞レスポンス生電話選手権", label: 0 },
  { title: "好きな漫才のつかみは!? M-1決勝で先輩芸人が見せた革新的なつかみとは? 粗品車の免許取る!?【霜降り明星】", label: 0 },
  { title: "石橋貴明さんのモノマネで質問返し！【第一夜】", label: 0 },
  { title: "親戚が増えました【霜降り明星】", label: 0 },
  { title: "【ラブトラ３】最終話を振り返る【全話ネタバレあり】", label: 0 },
  { title: "【ドッキリ】漫才コントの設定から抜け出さずにひたすら過ごしてみた", label: 0 },
  { title: "【粗品フリップクイズ】全問正解で賞金100万円!? フリップを見てセリフ当てられるか!?【霜降り明星】", label: 0 },
  { title: "褒める感じで悪口言ったらバレない？【ラランド】", label: 0 },
];

const FEW_SHOT_TEXT = FEW_SHOTS.map(
  (shot, index) => `例${index + 1}: タイトル="${shot.title}" -> label=${shot.label}`,
).join("\n");

export type LLMClassification = {
  title: string;
  label: number;
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
    rawResponse: rawText,
  };
}

function parseJsonOutput(text: string): {
  label: number;
} {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("LLM応答がJSON形式ではありません。");
  }
  const json = JSON.parse(match[0]);
  const label = Number(json.label);
  if (!Number.isFinite(label) || (label !== 0 && label !== 1)) {
    throw new Error("label が 0/1 で返却されませんでした。");
  }
  return {
    label,
  };
}
