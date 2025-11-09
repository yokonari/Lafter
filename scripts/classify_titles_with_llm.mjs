#!/usr/bin/env node

/**
 * data/video_titles_unlabeled.csv などのタイトル一覧を GPT-5 nano で判定し、
 * LLM の出力（label/score/理由）を含む CSV を丁寧に書き出す補助スクリプト。
 *
 * 使い方:
 *   OPENAI_API_KEY=... node scripts/classify_titles_with_llm.mjs \
 *     data/video_titles_unlabeled.csv data/video_titles_llm.csv
 *
 * 入力CSVのデフォルト: data/video_titles_unlabeled.csv
 * 出力CSVのデフォルト: data/video_titles_llm.csv
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import OpenAI from "openai";

const INPUT_PATH = process.argv[2] ?? "data/video_titles_unlabeled.csv";
const OUTPUT_PATH = process.argv[3] ?? "data/video_titles_llm.csv";

const resolvedApiKey = resolveApiKey();
if (!resolvedApiKey) {
  console.error(
    "OpenAI APIキーが見つかりませんでした。OPENAI_API_KEY を環境変数、.env.local、.env、または .dev.vars に設定してください。",
  );
  process.exit(1);
}

const client = new OpenAI({
  apiKey: resolvedApiKey,
});

const PROMPT_HEADER = `あなたは「お笑い動画のタイトル」を分類する専門家です。目的: タイトルが「ネタ動画（漫才・コントなどの本編）」かどうかを判定すること。必ず json 形式 {"label":0|1,"confidence":0-1,"reason":"..."} で応答してください。

- label: 1=ネタ動画 (コント/漫才など演目本編), 0=それ以外（告知/配信/雑談/切り抜き 等）。
- confidence: 0〜1 の少数。判断が曖昧なときは 0.4 など低めにする。
- reason: 判定根拠となる語やニュアンスを日本語で 20 文字以内に圧縮し、「配信タイトル」「ネタ本編」など簡潔なフレーズで書く。
- タイトル以外の情報を推測しない。過度に断定できない場合は「曖昧」「推測」などを含めて丁寧に説明する。
- 以下の構造/語句はネタ本編である可能性が高いため、強く label=1 を検討する:
  - 「芸人名」や「コンビ名」と「『○○』」「「○○」」など二重括弧付きの演目名が同じタイトル内に並ぶケース（順序は問わない）。括弧内の語が雑談風でも形式自体が強いシグナルなので内容は過度に重視しない。
  - 「モノマネ」「ものまね」といった語。
  - 「歌ってみた」と明記された動画タイトル。
  - 「あるある」で締める、もしくは強調されているタイトル。
`;

// few-shot（ユーザーが用意した例をここに記述）
const fewShots = [
  { title: "【コント】面白すぎて生徒人気No.1の先生", label: true },
  { title: "レインボー【キレイだ】", label: true },
  { title: "同棲して10年、会話少ないけどちゃんと仲良しなカップル", label: true },
  { title: "ジェラードン「人見知り」【公式】", label: true },
  { title: "お見合いでお互いナシすぎて、逆に仲良くなった【ジェラードン】", label: true },
  { title: "春とヒコーキ土岡　落語「疝気の虫」", label: true },
  { title: "終電後バイト先の店長の家にきてしまった女の子", label: true },
  { title: "20代女子から絶大な人気を誇る恋愛リアリティーショーに“ありそう”な神回", label: true },
  { title: "漫才「カラオケ」【霜降り明星】7/100", label: true },
  { title: "カフェ", label: true },
  { title: "パンダ", label: true },
  { title: "四千頭身「昨日の晩ごはん」", label: true },
  { title: "四千頭身「駅伝」", label: true },
  { title: "イイね(笑)ライブ！１０月大会！第1位★ラランド★", label: true },
  { title: "【ベーキング】中田ブチギレ問題【short】", label: false },
  { title: "ウエスPも参加!18歳から大人! ゆりやんとつくるラップ動画チャレンジ", label: false },
  { title: "ほんとうにあった怖くもないし意味がわからない話", label: true },
  { title: "同期のネタで好きなくだり。【9番街レトロ】#アックスボンバー", label: false },
  { title: "千原せいじにタメ口で失礼な事言いまくった", label: false },
  { title: "【サワガニ】見つける速さ、しかし／佐久間一行＆はいじぃ", label: false },
  { title: "DB芸人 キャラ台詞レスポンス生電話選手権", label: false },
  { title: "好きな漫才のつかみは!? M-1決勝で先輩芸人が見せた革新的なつかみとは? 粗品車の免許取る!?【霜降り明星】", label: false },
  { title: "石橋貴明さんのモノマネで質問返し！【第一夜】", label: false },
  { title: "親戚が増えました【霜降り明星】", label: false },
  { title: "【ラブトラ３】最終話を振り返る【全話ネタバレあり】", label: false },
  { title: "【ドッキリ】漫才コントの設定から抜け出さずにひたすら過ごしてみた", label: false },
  { title: "【粗品フリップクイズ】全問正解で賞金100万円!? フリップを見てセリフ当てられるか!?【霜降り明星】", label: false },
  { title: "褒める感じで悪口言ったらバレない？【ラランド】", label: false },
];

function buildFewShotPrompt() {
  if (!fewShots.length) {
    return "";
  }
  const lines = fewShots
    .map(
      (shot, index) =>
        `例${index + 1}: タイトル="${shot.title}" -> label=${shot.label ? 1 : 0}`,
    )
    .join("\n");
  return `\n以下は参考例です:\n${lines}\n`;
}

const FEW_SHOT_PROMPT = buildFewShotPrompt();

async function loadTitles(csvPath) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSVファイルが見つかりません: ${csvPath}`);
  }

  const titles = [];
  const stream = fs.createReadStream(csvPath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let headers = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (headers.length === 0) {
      headers = line.split(",");
      continue;
    }
    const cols = line.split(",");
    const titleIndex = headers.indexOf("title");
    if (titleIndex === -1) {
      throw new Error("CSVに title 列が存在しません。");
    }
    const title = cols[titleIndex]?.trim() ?? "";
    if (title) {
      titles.push(title);
    }
  }
  return titles;
}

async function classifyWithLLM(title) {
  const response = await client.responses.create({
    model: "gpt-5-nano",
    input: [
      {
        role: "system",
        content: `${PROMPT_HEADER}${FEW_SHOT_PROMPT}`,
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
  const rawText = response.output_text ?? "";
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      `LLM応答がJSON形式ではありません: ${rawText.substring(0, 200)}`,
    );
  }
  const parsedPayload = JSON.parse(jsonMatch[0]);
  let parsed = parsedPayload;
  if (!parsed) {
    throw new Error("LLM応答がJSON形式ではありません");
  }
  return {
    title,
    label:
      typeof parsed.label === "number" ? parsed.label : Number(parsed.label),
    confidence:
      typeof parsed.confidence === "number"
        ? parsed.confidence
        : Number(parsed.confidence ?? 0),
    reason:
      typeof parsed.reason === "string"
        ? parsed.reason
        : "LLM応答がJSON形式ではありません",
  };
}

async function main() {
  try {
    const titles = await loadTitles(INPUT_PATH);
    if (titles.length === 0) {
      console.error("入力CSVにタイトルがありません。");
      process.exit(1);
    }
    console.log(`LLM判定を開始します: ${titles.length} 件`);

    const results = await classifyTitlesConcurrently(titles);

    const csvRows = [
      ["title", "label_llm", "confidence_llm", "reason"],
      ...results.map((row) => [
        row.title,
        row.label,
        row.confidence,
        row.reason?.replace(/\r?\n/g, " "),
      ]),
    ]
      .map((cols) => cols.map((col) => `"${String(col ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    fs.writeFileSync(OUTPUT_PATH, csvRows, { encoding: "utf-8" });
    console.log(`LLM判定結果を書き出しました: ${OUTPUT_PATH}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

function resolveApiKey() {
  const direct = process.env.OPENAI_API_KEY;
  if (typeof direct === "string" && direct.trim() !== "") {
    return direct.trim();
  }

  const envFiles = [".env.local", ".env", ".dev.vars"];
  for (const filename of envFiles) {
    const fullPath = path.join(process.cwd(), filename);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, { encoding: "utf-8" });
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (key === "OPENAI_API_KEY") {
        const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
        if (value) {
          process.env.OPENAI_API_KEY = value;
          return value;
        }
      }
    }
  }
  return null;
}

async function classifyTitlesConcurrently(titles) {
  const concurrency = Math.max(
    1,
    Math.min(
      titles.length,
      Number(process.env.LLM_CONCURRENCY ?? 10),
    ),
  );
  const results = new Array(titles.length);
  let nextIndex = 0;
  let processed = 0;

  async function worker() {
    while (true) {
      const current = nextIndex;
      if (current >= titles.length) break;
      nextIndex += 1;
      const title = titles[current];
      try {
        const result = await classifyWithLLM(title);
        results[current] = result;
      } catch (error) {
        results[current] = {
          title,
          label: "",
          confidence: "",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
      processed += 1;
      if (processed % 10 === 0 || processed === titles.length) {
        console.log(`進捗: ${processed}/${titles.length}`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

function extractMessageText(response) {
  if (!response?.choices?.length) {
    return "";
  }
  for (const choice of response.choices) {
    const content = choice?.message?.content;
    const text = normalizeContent(content);
    if (text) {
      return text;
    }
  }
  return (
    response.choices
      .map((choice) => normalizeContent(choice?.message?.content))
      .filter(Boolean)
      .join("\n") || ""
  );
}

function normalizeContent(content) {
  if (!content) return "";
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part) return "";
        if (typeof part === "string") return part;
        if (part.type === "text" && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}
