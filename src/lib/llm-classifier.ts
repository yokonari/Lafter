import OpenAI from "openai";

const PROMPT_HEADER = `あなたは「お笑い動画のタイトル」を分類する専門家です。目的: タイトルが「ネタ動画（漫才・コントなどの本編）」かどうかを判定すること。必ず json 形式 {"label":"true"|"false"} で応答し、余計なキーは一切追加しないでください。

- label: "true"=ネタ動画 (コント/漫才など演目本編)、"false"=それ以外（告知・企画・雑談など）。
- confidence や reason といった追加情報は出力しないでください。必ず {"label":"true"} もしくは {"label":"false"} のみ。
- タイトル以外の情報を推測しない。迷う場合は "false" を返し、「label」以外のテキストは含めないこと。
- 以下のケースではネタ本編の可能性が高いと判断し、強く label="true" を検討する:
  - 「芸人名」や「コンビ名」と「『○○』」「「○○」」「【○○】」などの括弧付き演目名が並ぶ形式（順序問わず）。括弧内が短くても構わない。
  - 「漫談」「公式」「ネタ」「モノマネ」「ものまね」「歌」「あるある」といった語が演目紹介的に使われている場合。
  - 「〜なやつ」「〜な時」「〜な人」のようにシチュエーションだけで説明されているタイトル。
  - 芸人名＋括弧のみといった構造でも本編であることが多い。
- 次の語が含まれる場合は企画/バラエティ色が強く、原則 label="false":
  - 「やってみた」「してみた」「聞いてみた」「企画」「トーク」「チャレンジ」「放送事故」「密着」など、概要説明が完結している文章。
- 「「」「」【】『』」など括弧が含まれるタイトルは必ず LLM 判定対象とみなし、括弧だけで判断せず全体の文意を精査する。
- 「歌ってみた」「ものまね/モノマネ」「あるある」がタイトル末尾や強調に使われる場合は基本的にネタ video であると考える。
- いずれの場合もタイトルの語順や括弧の種類に依らず、上記ルールに従って慎重に true/false を決めること。
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
  { title: "パンダ", label: "true" },
  { title: "四千頭身「昨日の晩ごはん」", label: "true" },
  { title: "四千頭身「駅伝」", label: "true" },
  { title: "イイね(笑)ライブ！１０月大会！第1位★ラランド★", label: "true" },
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
  { title: "【ドッキリ】漫才コントの設定から抜け出さずにひたすら過ごしてみた", label: "false" },
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
