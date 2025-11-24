#!/usr/bin/env node

/**
 * /api/classify (mode=llm) を 50 件ずつ繰り返し呼び出す簡易スクリプトです。
 * --limit で指定された件数を 50 ずつに分割し、limit / 50（端数切り上げ）回 POST します。
 */

import process from "node:process";

const CHUNK_SIZE = 50;

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

function parsePositiveInt(value, label) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`${label} には 1 以上の整数を指定してください: ${value}`);
  }
  return num;
}

async function callClassify(endpoint, headers) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ mode: "llm" }),
  });
  const text = await response.text();
  return { response, text };
}

async function main() {
  const args = parseArgs(process.argv);
  const endpoint = args.endpoint ?? "https://lafter.kaede61120.workers.dev/api/classify";
  const limitArg = args.limit ?? args.count ?? args.total;
  if (!limitArg) {
    console.error("Error: --limit を指定してください。");
    process.exitCode = 1;
    return;
  }

  let limit;
  try {
    limit = parsePositiveInt(limitArg, "--limit");
  } catch (error) {
    console.error(`Error: ${(error instanceof Error ? error.message : String(error))}`);
    process.exitCode = 1;
    return;
  }

  const cliSecret = typeof args.secret === "string" && args.secret !== "true"
    ? args.secret.trim()
    : "";
  const envSecret = typeof process.env.API_SECRET === "string"
    ? process.env.API_SECRET.trim()
    : "";
  const apiSecret = cliSecret || envSecret;
  if (!apiSecret) {
    console.error("Error: API_SECRET が未設定です。--secret もしくは環境変数で指定してください。");
    process.exitCode = 1;
    return;
  }

  const iterations = Math.ceil(limit / CHUNK_SIZE);
  const headers = {
    "Content-Type": "application/json",
    "X-Api-Secret": apiSecret,
  };

  console.log(`Endpoint : ${endpoint}`);
  console.log(`Limit    : ${limit}`);
  console.log(`Chunk    : ${CHUNK_SIZE}`);
  console.log(`Requests : ${iterations}`);

  for (let i = 0; i < iterations; i += 1) {
    console.log(`\n[${new Date().toISOString()}] 第 ${i + 1}/${iterations} 回目を実行します`);
    try {
      const { response, text } = await callClassify(endpoint, headers);
      console.log(`  -> HTTP ${response.status}`);
      console.log(`  -> Response: ${text}`);
      if (!response.ok) {
        console.error("  ⚠️ API 呼び出しに失敗したためループを中断します。");
        process.exitCode = 1;
        return;
      }
    } catch (error) {
      console.error(`  ⚠️ ネットワークエラー: ${(error instanceof Error ? error.message : String(error))}`);
      process.exitCode = 1;
      return;
    }
  }

  console.log("\nすべてのリクエストが完了しました。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
