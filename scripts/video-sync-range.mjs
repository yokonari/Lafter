#!/usr/bin/env node

/**
 * 動画同期API (/api/videos/sync) を指定した index で順次呼び出すヘルパースクリプトです。
 *
 * 使い方（一例）:
 *   node scripts/video-sync-range.mjs --endpoint http://localhost:3000/api/videos/sync --csv data/artists.csv --delay 1500 --start 74 --end 80
 *
 * オプション:
 *   --endpoint <url>    : 必須。対象となる /api/videos/sync のURL。
 *   --csv <path>        : CSV ファイルを指定し、status=0 の行を自動抽出しつつ、成功時に status=1 へ更新します。
 *   --index <number>    : 単一インデックスを指定（複数回記述/カンマ区切り可）。
 *   --range <start-end> : 範囲を指定。例: --range 10-20
 *   --start <n> --end <m>: 範囲を個別指定。end 未指定の場合 start のみを実行。
 *   --delay <ms>        : 各リクエスト間の待機ミリ秒（既定: 1000）。
 *   --secret <value>    : 任意。API_SECRET を直接指定し、ヘッダー経由で丁寧に送信します。
 *
 * index/range/start/end を指定しない場合でも、--csv があれば status=0 の行をまとめて処理します。
 */

import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { readFile, writeFile } from "node:fs/promises";

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

  if (opts.index && opts.index !== "true") {
    const values = opts.index.split(",");
    for (const value of values) {
      if (!value.trim()) continue;
      indices.add(parseNumber(value.trim(), "--index"));
    }
  }

  if (opts.range && opts.range !== "true") {
    const { start, end } = parseRange(opts.range);
    for (let i = start; i <= end; i += 1) {
      indices.add(i);
    }
  }

  if (opts.start && opts.start !== "true") {
    const start = parseNumber(opts.start, "--start");
    if (opts.end && opts.end !== "true") {
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

function escapeCsvValue(value) {
  if (/["\n\r,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function normalizeHeader(value) {
  return value.trim().toLowerCase();
}

async function loadCsvState(path) {
  const text = await readFile(path, "utf8");
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const trimmed = text.endsWith("\n") || text.endsWith("\r")
    ? text.replace(/[\r\n]+$/, "")
    : text;
  const lines = trimmed.split(/\r?\n/);
  if (lines.length <= 1) {
    return null;
  }

  const header = splitCsvLine(lines[0] ?? "");
  const indexCol = header.findIndex((name) => normalizeHeader(name) === "index");
  const statusCol = header.findIndex((name) => normalizeHeader(name) === "status");
  const artistCol = header.findIndex((name) => normalizeHeader(name) === "artist");

  if (statusCol < 0) {
    console.warn("Warning: CSV に status 列が見つからないため、自動更新をスキップします。");
  }

  const rows = lines.slice(1).map((line, rowIdx) => {
    const cols = splitCsvLine(line);
    const indexValue =
      indexCol >= 0 ? (cols[indexCol] ?? "").trim() : String(rowIdx);
    const parsedIndex = Number(indexValue);
    const artistValue =
      artistCol >= 0
        ? (cols[artistCol] ?? "").trim()
        : (cols[1] ?? "").trim();
    return {
      cols,
      index: Number.isInteger(parsedIndex) && parsedIndex >= 0 ? parsedIndex : null,
      artist: artistValue,
    };
  });

  const collectTargets = () => {
    const result = [];
    for (const row of rows) {
      if (row.index === null || !row.artist) continue;
      if (statusCol >= 0) {
        const statusValue = (row.cols[statusCol] ?? "").trim();
        if (statusValue !== "0") continue;
      }
      result.push({ index: row.index, artist: row.artist });
    }
    return result;
  };

  const findRowByIndex = (targetIndex) =>
    rows.find((row) => row.index === targetIndex) ?? null;

  const serialize = () => {
    const headerLine = header.map(escapeCsvValue).join(",");
    const rowLines = rows.map((row) =>
      row.cols.map((value) => escapeCsvValue(value ?? "")).join(","),
    );
    return `${[headerLine, ...rowLines].join(newline)}${newline}`;
  };

  const markProcessed = async (targetIndex) => {
    if (statusCol < 0) return;
    const row = rows.find((r) => r.index === targetIndex);
    if (!row) return;
    if ((row.cols[statusCol] ?? "").trim() === "1") return;
    row.cols[statusCol] = "1";
    await writeFile(path, serialize(), "utf8");
  };

  return {
    targets: collectTargets,
    findRowByIndex,
    markProcessed,
    hasStatusColumn: statusCol >= 0,
    getStatusByIndex: (targetIndex) => {
      if (statusCol < 0) return null;
      const row = findRowByIndex(targetIndex);
      return row ? (row.cols[statusCol] ?? "").trim() : null;
    },
  };
}

function collectCliArtists(opts) {
  const artists = [];
  const values = [];
  if (opts.artist && opts.artist !== "true") {
    values.push(...opts.artist.split(","));
  }
  if (opts.artists && opts.artists !== "true") {
    values.push(...opts.artists.split(","));
  }
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) artists.push(trimmed);
  }
  return artists;
}

async function syncArtist(endpoint, target, options) {
  const url = new URL(endpoint);
  if (typeof target.index === "number") {
    url.searchParams.set("index", String(target.index));
  }

  const headers = {
    "Content-Type": "application/json",
  };
  if (options?.apiSecret) {
    headers["X-Api-Secret"] = options.apiSecret;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ artist: target.artist }),
  });
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

  const cliSecret = typeof args.secret === "string" && args.secret !== "true"
    ? args.secret.trim()
    : "";
  const envSecret = typeof process.env.API_SECRET === "string"
    ? process.env.API_SECRET.trim()
    : "";
  // CLI 引数/環境変数の双方から丁寧にシークレットを解決します。
  const apiSecret = cliSecret || envSecret;

  let csvState = null;
  if (args.csv && args.csv !== "true") {
    try {
      csvState = await loadCsvState(args.csv);
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

  let tasks = [];
  const cliIndices = (() => {
    try {
      return collectCliIndices(args);
    } catch (error) {
      console.error(`Error: ${(error instanceof Error ? error.message : String(error))}`);
      process.exitCode = 1;
      return null;
    }
  })();
  if (cliIndices === null) return;

  const cliArtists = collectCliArtists(args);
  for (const artist of cliArtists) {
    tasks.push({ index: null, artist, markCsv: false });
  }

  if (cliIndices.length > 0) {
    if (!csvState) {
      console.error("Error: index を指定する場合、対応する artist を得るために --csv も指定してください。");
      process.exitCode = 1;
      return;
    }
    for (const index of cliIndices) {
      const row = csvState.findRowByIndex(index);
      if (!row) {
        console.warn(`Warning: CSV 上で index=${index} の行が見つかりません。スキップします。`);
        continue;
      }
      if (!row.artist) {
        console.warn(`Warning: index=${index} の artist が空です。スキップします。`);
        continue;
      }
      if (csvState.hasStatusColumn) {
        const statusValue = csvState.getStatusByIndex(index);
        if (statusValue !== "0") {
          console.warn(`Warning: index=${index} の status が ${statusValue} のためスキップします。`);
          continue;
        }
      }
      tasks.push({ index, artist: row.artist, markCsv: true });
    }
  } else if (csvState) {
    tasks.push(
      ...csvState.targets().map((target) => ({
        index: target.index,
        artist: target.artist,
        markCsv: true,
      })),
    );
  }

  if (tasks.length === 0) {
    console.error(
      "Error: 処理対象がありません。--artist / --artists / --csv を利用して artist を指定してください。",
    );
    process.exitCode = 1;
    return;
  }

  const delayMs = args.delay ? Number(args.delay) || 0 : 1000;
  console.log(`Endpoint: ${endpoint}`);
  if (args.csv && args.csv !== "true") {
    console.log(`CSV     : ${args.csv}`);
  }
  const taskSummary = tasks
    .map((task) =>
      typeof task.index === "number" ? `#${task.index}:${task.artist}` : task.artist,
    )
    .join(", ");
  console.log(`Targets : ${taskSummary}`);
  console.log(`Delay   : ${delayMs}ms`);
  // レンジ未指定時はAPIの呼び出し上限(15件)を丁寧に順守するための管理値です。
  const shouldLimitCalls = cliIndices.length === 0;
  const apiCallLimit = 15;
  let processedCount = 0;

  for (const task of tasks) {
    try {
      console.log(
        `\n[${new Date().toISOString()}] artist="${task.artist}"${
          typeof task.index === "number" ? ` (index=${task.index})` : ""
        } を処理します…`,
      );
      const { response, body } = await syncArtist(endpoint, task, { apiSecret });
      const isJsonObject = body && typeof body === "object";
      const reportedErrors =
        isJsonObject && Array.isArray(body.errors) ? body.errors.filter(Boolean) : [];
      const hasReportedErrors = reportedErrors.length > 0;

      if (!response.ok || hasReportedErrors) {
        const errorSummary = hasReportedErrors
          ? `API 応答に ${reportedErrors.length} 件のエラーが含まれています。`
          : `HTTP ${response.status}`;
        console.error(
          `  ❌ ${errorSummary} ${
            typeof body === "object" ? JSON.stringify(body) : body
          }`,
        );
      } else {
        console.log(
          `  ✅ 成功: ${
            typeof body === "object" ? JSON.stringify(body) : body
          }`,
        );
        if (task.markCsv && csvState && typeof task.index === "number") {
          try {
            await csvState.markProcessed(task.index);
          } catch (error) {
            console.error(
              `  ⚠️ CSV 更新に失敗しました: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      }
    } catch (error) {
      console.error(`  ⚠️ エラー: ${(error instanceof Error ? error.message : String(error))}`);
    }
    processedCount += 1;
    if (shouldLimitCalls && processedCount >= apiCallLimit) {
      console.log(`\nAPI呼び出し上限(${apiCallLimit}件)に到達したため、残りのタスクを丁寧にスキップして終了します。`);
      break;
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
