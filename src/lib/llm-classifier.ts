import OpenAI from "openai";

const PROMPT_HEADER = `
あなたはお笑い動画タイトルの分類者です。
タイトルが「ネタ本編」か「それ以外」かを {"label":"true"|"false"} だけで返してください。

【true と判断する主な条件】
- 芸人名＋「『◯◯』」「「◯◯」」「【◯◯】」「/◯◯」などの演目名形式
  例: 四千頭身「昨日の晩ごはん」、さすらいラビー「ASMR」
- セリフやシチュエーションだけで構成された、1本のコント・漫才の題名に見えるタイトル
- 「漫才」「コント」「ネタ」「落語」「漫談」「モノマネ」「あるある」などが
  演目として使われている場合
- 迷う場合は false を優先する（true はかなり確信があるときだけ）

【false と判断する主な条件】
- 占い／飯テロ／料理／ごはん／紹介／食べてみた
- 生配信／トーク／やってみた／チャレンジ／密着／Vlog／TikTok／ダンス
- 複数芸人名＋行動描写（◯◯＆◯◯が〜する など）
- カテゴリタグを【◯◯】と並べているだけのタイトル

【特に false にする「企画・ラジオ」パターン】
- タイトルの先頭や【】内に「ドッキリ」「検証」「ゲーム」「チャレンジ」
  「選手権」「対決」「対戦」「初対戦」「企画」「新企画」「キャンプ」が入っている
- 「〜してみた」「〜やってみた」「〜させてみた」「〜流してみた」「〜見てみた」など
  何かを試す・検証する企画動画
- 「ラジオ」「ニューラジオ」「○○ラジオ」「#◯◯」などラジオ・トーク番組を表す語がある
- 「#shorts」「＃shorts」が付き、ネタ本編ではなく企画・切り抜きに見えるもの
- 日付入り（「3月24日」「今日の◯◯」など）で、日常や日記・Vlogの記録に見えるもの

※「ネタ」「漫才」「コント」といった単語が入っていても、
  上のような企画・ラジオ系のパターンに当てはまる場合は false を優先する。

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
  { title: "【ドッキリ】寝ているところに凸したら、楢原は漫才ができるのか？", label: "false" },
  { title: "相手の想像してる人を最短で当てろ！たちネイター！【吉田たち】", label: "false" },
  { title: "【誠、怒りの1連鎖祭り】コンビでぷよぷよ初対戦！【ヨネダ2000】", label: "false" },
  { title: "R-１チャンピオンのバレたくない昔のネタ動画を本人の前で流してみた　＃shorts", label: "false" },
  { title: "【M-1新企画】M-1芸人のネタを踊りだけで当てろ！「お笑いダンシングジェスチャーゲーム」【令和ロマン】", label: "false" },
  { title: "【43歳独身女芸人と猫】3月24日のステとごま #牧野ステテコ #完全勝利 #ファンレター", label: "false" },
  { title: "波田陽区がやらかす！高級肉があわや…【お戯れキャンプ】", label: "false" },
  { title: "【ギリキス】体の中でギリギリキスできる部位はどこなんだよ【金魚番長】", label: "false" },
  { title: "レイザーラモンのニューラジオ#28 キングオブコント用のネタ仕上がりたての2人", label: "false" },
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
