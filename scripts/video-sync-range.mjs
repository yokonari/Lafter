#!/usr/bin/env node

/**
 * 動画同期API (/api/videos/sync) を指定した index で順次呼び出すヘルパースクリプトです。
 *
 * 使い方（一例）:
 *   node scripts/video-sync-range.mjs --endpoint https://example.com/api/videos/sync \
 *     --csv ./artists.csv --delay 1500
 *
 * オプション:
 *   --endpoint <url>    : 必須。対象となる /api/videos/sync のURL。
 *   --csv <path>        : CSV ファイルを指定し、status=0 の行を自動抽出します。
 *   --index <number>    : 単一インデックスを指定（複数回記述/カンマ区切り可）。
 *   --range <start-end> : 範囲を指定。例: --range 10-20
 *   --start <n> --end <m>: 範囲を個別指定。end 未指定の場合 start のみを実行。
 *   --delay <ms>        : 各リクエスト間の待機ミリ秒（既定: 1000）。
 *
 * index/range/start/end を指定しない場合でも、--csv があれば status=0 の行をまとめて処理します。
 */

import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { readFile } from "node:fs/promises";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      i -= 1;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function parseNumber(value, label) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`${label} は 0 以上の整数で指定してください: ${value}`);
  }
  return num;
}

function parseRange(rangeText) {
  const [startText, endText] = rangeText.split("-");
  if (startText === undefined || endText === undefined) {
    throw new Error(`範囲の形式が不正です (例: 10-20)。入力: ${rangeText}`);
  }
  const start = parseNumber(startText.trim(), "range start");
  const end = parseNumber(endText.trim(), "range end");
  if (end < start) {
    throw new Error(`range end (${end}) は start (${start}) 以上である必要があります。`);
  }
  return { start, end };
}

function collectCliIndices(opts) {
  const indices = new Set();

  if (opts.index) {
    const values = opts.index.split(",");
    for (const value of values) {
      if (!value.trim()) continue;
      indices.add(parseNumber(value.trim(), "--index"));
    }
  }

  if (opts.range) {
    const { start, end } = parseRange(opts.range);
    for (let i = start; i <= end; i += 1) {
      indices.add(i);
    }
  }

  if (opts.start) {
    const start = parseNumber(opts.start, "--start");
    if (opts.end) {
      const end = parseNumber(opts.end, "--end");
      if (end < start) {
        throw new Error("--end は --start 以上を指定してください。");
      }
      for (let i = start; i <= end; i += 1) {
        indices.add(i);
      }
    } else {
      indices.add(start);
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

function splitCsvLine(line) {
  const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g);
  return cols.map((s) =>
    s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s,
  );
}

function normalizeHeader(value) {
  return value.trim().toLowerCase();
}

async function collectCsvIndices(path) {
  const text = await readFile(path, "utf8");
  const lines = text.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];

  const header = splitCsvLine(lines[0] ?? "");
  const indexCol = header.findIndex((name) => normalizeHeader(name) === "index");
  const statusCol = header.findIndex((name) => normalizeHeader(name) === "status");

  const indices = [];
  for (let row = 1; row < lines.length; row += 1) {
    const line = lines[row];
    if (!line) continue;
    const cols = splitCsvLine(line);
    if (statusCol >= 0) {
      const statusValue = (cols[statusCol] ?? "").trim();
      if (statusValue !== "0") continue;
    }
    const indexValue =
      indexCol >= 0 ? (cols[indexCol] ?? "").trim() : String(row - 1);
    const parsedIndex = Number(indexValue);
    if (!Number.isInteger(parsedIndex) || parsedIndex < 0) continue;
    indices.push(parsedIndex);
  }

  return indices;
}

async function syncIndex(endpoint, index) {
  const url = new URL(endpoint);
  url.searchParams.set("index", String(index));

  const response = await fetch(url, { method: "POST" });
  const contentType = response.headers.get("content-type") ?? "";
  let body;
  if (contentType.includes("application/json")) {
    body = await response.json();
  } else {
    body = await response.text();
  }
  return { response, body };
}

async function main() {
  const args = parseArgs(process.argv);
  const endpoint = args.endpoint;
  if (!endpoint) {
    console.error("Error: --endpoint を指定してください。");
    process.exitCode = 1;
    return;
  }

  let indices = [];
  try {
    indices = collectCliIndices(args);
  } catch (error) {
    console.error(`Error: ${(error instanceof Error ? error.message : String(error))}`);
    process.exitCode = 1;
    return;
  }

  if (indices.length === 0 && args.csv && args.csv !== "true") {
    try {
      const csvIndices = await collectCsvIndices(args.csv);
      indices = csvIndices;
    } catch (error) {
      console.error(
        `Error: CSV の読み込みに失敗しました (${args.csv}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      process.exitCode = 1;
      return;
    }
  }

  if (indices.length === 0) {
    console.error(
      "Error: 処理対象がありません。--index / --range / --start (--end) または --csv を指定してください。",
    );
    process.exitCode = 1;
    return;
  }

  const delayMs = args.delay ? Number(args.delay) || 0 : 1000;
  console.log(`Endpoint: ${endpoint}`);
  if (args.csv && args.csv !== "true") {
    console.log(`CSV     : ${args.csv}`);
  }
  console.log(`Targets : ${indices.join(", ")}`);
  console.log(`Delay   : ${delayMs}ms`);

  for (const index of indices) {
    try {
      console.log(`\n[${new Date().toISOString()}] index=${index} を処理します…`);
      const { response, body } = await syncIndex(endpoint, index);
      if (!response.ok) {
        console.error(
          `  ❌ HTTP ${response.status} ${
            typeof body === "object" ? JSON.stringify(body) : body
          }`,
        );
      } else {
        console.log(
          `  ✅ 成功: ${
            typeof body === "object" ? JSON.stringify(body) : body
          }`,
        );
      }
    } catch (error) {
      console.error(`  ⚠️ エラー: ${(error instanceof Error ? error.message : String(error))}`);
    }
    if (delayMs > 0) {
      await delay(delayMs);
    }
  }

  console.log("\n処理が完了しました。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
