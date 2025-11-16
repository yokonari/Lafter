import OpenAI from "openai";

const PROMPT_HEADER = `
あなたはお笑い動画タイトルの分類者です。
タイトルが「ネタ本編」か「それ以外」かを {"label":"true"|"false"} だけで返してください。

【true と判断する主な条件】
- 芸人名＋「『◯◯』」「「◯◯」」「【◯◯】」などの演目名形式
  例: 四千頭身「昨日の晩ごはん」、さすらいラビー「ASMR」
- 単語だけ・短い題名だけで構成されるタイトル（カフェ、パンダ 等）
  ※ただし企画を示す語がなければ
- 「漫才」「コント」「ネタ」「落語」「漫談」「モノマネ」「あるある」などが
  演目として使われている場合

【false と判断する主な条件】
- 占い／飯テロ／料理／ごはん／紹介／食べてみた
- 生配信／トーク／やってみた／チャレンジ／密着／Vlog／TikTok／ダンス
- 複数芸人名＋行動描写（◯◯＆◯◯が〜する など）
- カテゴリタグを【◯◯】と並べているだけのタイトル

上記のどれにも当たらず、ネタか不明な場合は "false"。
出力は {"label":"true"} または {"label":"false"} のみ。
`;

// scripts/classify_titles_with_llm.mjs の fewShots と同一内容に揃え、LLMへの参照例を丁寧に同期させます。
const FEW_SHOTS = [
  { title: "【コント】面白すぎて生徒人気No.1の先生", label: "true" },
  { title: "レインボー【キレイだ】", label: "true" },
  { title: "同棲して10年、会話少ないけどちゃんと仲良しなカップル", label: "true" },
  { title: "ジェラードン「人見知り」【公式】", label: "true" },
  { title: "お見合いでお互いナシすぎて、逆に仲良くなった【ジェラードン】", label: "true" },
  { title: "春とヒコーキ土岡　落語「疝気の虫」", label: "true" },
  { title: "終電後バイト先の店長の家にきてしまった女の子", label: "true" },
  { title: "20代女子から絶大な人気を誇る恋愛リアリティーショーに“ありそう”な神回", label: "true" },
  { title: "漫才「カラオケ」【霜降り明星】7/100", label: "true" },
  { title: "カフェ", label: "true" },
  { title: "さすらいラビー「ASMR」", label: "true" },
  { title: "四千頭身「昨日の晩ごはん」", label: "true" },
  { title: "四千頭身「駅伝」", label: "true" },
  { title: "【ベーキング】中田ブチギレ問題【short】", label: "false" },
  { title: "ウエスPも参加!18歳から大人! ゆりやんとつくるラップ動画チャレンジ", label: "false" },
  { title: "ほんとうにあった怖くもないし意味がわからない話", label: "true" },
  { title: "同期のネタで好きなくだり。【9番街レトロ】#アックスボンバー", label: "false" },
  { title: "千原せいじにタメ口で失礼な事言いまくった", label: "false" },
  { title: "【サワガニ】見つける速さ、しかし／佐久間一行＆はいじぃ", label: "false" },
  { title: "DB芸人 キャラ台詞レスポンス生電話選手権", label: "false" },
  { title: "好きな漫才のつかみは!? M-1決勝で先輩芸人が見せた革新的なつかみとは? 粗品車の免許取る!?【霜降り明星】", label: "false" },
  { title: "石橋貴明さんのモノマネで質問返し！【第一夜】", label: "false" },
  { title: "親戚が増えました【霜降り明星】", label: "false" },
  { title: "【ラブトラ３】最終話を振り返る【全話ネタバレあり】", label: "false" },
  { title: "【粗品フリップクイズ】全問正解で賞金100万円!? フリップを見てセリフ当てられるか!?【霜降り明星】", label: "false" },
  { title: "褒める感じで悪口言ったらバレない？【ラランド】", label: "false" },
];

const FEW_SHOT_TEXT = FEW_SHOTS.map(
  (shot, index) => `例${index + 1}: タイトル="${shot.title}" -> label=${shot.label}`,
).join("\n");

export type LLMClassification = {
  title: string;
  label: "true" | "false";
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
  label: "true" | "false";
} {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("LLM応答がJSON形式ではありません。");
  }
  const json = JSON.parse(match[0]);
  const rawLabel = typeof json.label === "string" ? json.label.toLowerCase().trim() : "";
  if (rawLabel !== "true" && rawLabel !== "false") {
    throw new Error('label が "true"/"false" で返却されませんでした。');
  }
  return {
    label: rawLabel,
  };
}
