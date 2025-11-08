#!/usr/bin/env node

/**
 * data/video_titles.csv から正例/負例をバランス良くサンプルし、
 * /api/classify エンドポイントへまとめて投げて推論結果を検証する補助スクリプトです。
 *
 * 使い方:
 *   node scripts/test_classify_api.mjs            # 各ラベル5件ずつ
 *   node scripts/test_classify_api.mjs 10         # 各ラベル10件ずつ
 *
 * 環境変数 CLASSIFY_ENDPOINT で API のURLを変更できます（既定: http://localhost:3000/api/classify）。
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const SAMPLE_PER_CLASS = Number(process.argv[2]) || 5;
const ENDPOINT =
  process.env.CLASSIFY_ENDPOINT ?? "http://localhost:3000/api/classify";
const CSV_PATH = path.join(process.cwd(), "data/video_titles.csv");

async function loadSamples() {
  const positives = [];
  const negatives = [];

  const stream = fs.createReadStream(CSV_PATH, { encoding: "utf8" });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue;
    }
    if (!line.trim()) continue;
    const idx = line.lastIndexOf(",");
    if (idx === -1) continue;
    const title = line.slice(0, idx);
    const label = line.slice(idx + 1).trim();
    if (label === "1") {
      positives.push({ title, label: 1 });
    } else if (label === "0") {
      negatives.push({ title, label: 0 });
    }
  }

  // 実行ごとに異なる検証セットを得られるよう、各クラスからランダム抽出します。
  return [
    ...pickRandomSamples(positives, SAMPLE_PER_CLASS),
    ...pickRandomSamples(negatives, SAMPLE_PER_CLASS),
  ];
}

function pickRandomSamples(source, count) {
  // Fisher-Yates シャッフルでシンプルにランダム抽出します。
  if (source.length <= count) {
    return [...source];
  }
  const indices = source.map((_, index) => index);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count).map((idx) => source[idx]);
}

async function callApi(titles) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titles }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `API呼び出しに失敗しました (status=${response.status}): ${text}`,
    );
  }
  return response.json();
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSVが見つかりません: ${CSV_PATH}`);
    process.exit(1);
  }

  const samples = await loadSamples();
  if (samples.length === 0) {
    console.error("サンプルを取得できませんでした。");
    process.exit(1);
  }

  console.log(
    `サンプル数: 正例${samples.filter((s) => s.label === 1).length}件 / 負例${
      samples.filter((s) => s.label === 0).length
    }件`,
  );
  console.log(`エンドポイント: ${ENDPOINT}`);

  const payloadTitles = samples.map((sample) => sample.title);
  const result = await callApi(payloadTitles);

  console.log(`API threshold: ${result.threshold}`);
  console.log("=== 結果 ===");
  result.results.forEach((entry, index) => {
    const expected = samples[index]?.label ?? "?";
    const status = entry.label === expected ? "✅" : "❌";
    console.log(
      `${status} title="${entry.title}" | normalized="${entry.normalizedTitle}" | prob=${entry.probability.toFixed(4)} | predicted=${entry.label} | expected=${expected}`,
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
