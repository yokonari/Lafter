#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

// CSV から aliases テーブルへ流し込む SQL を生成するための丁寧なスクリプトです。
async function main() {
  const args = new Set(process.argv.slice(2));
  const appendMode = args.has("--append");
  const noTransaction = args.has("--no-transaction");
  const rootDir = process.cwd();
  // const csvPath = path.resolve(rootDir, "data/channels/channel_name_alias.local.csv");
  const csvPath = path.resolve(rootDir, "data/channels/channel_name_alias.csv");
  const sqlOutputPath = path.resolve(rootDir, "migrations-temp/aliases_seed.sql");

  // CSV 全体を一括読み込みし、行単位で丁寧に解析します。
  const csvRaw = await readFile(csvPath, "utf8");
  const lines = csvRaw.split(/\r?\n/);
  const seen = new Set();
  const records = [];

  lines.forEach((rawLine, index) => {
    const trimmedLine = rawLine.trim();
    if (index === 0 || trimmedLine === "") {
      return; // 先頭ヘッダーおよび空行を丁寧にスキップします。
    }

    const delimiterIndex = rawLine.indexOf(",");
    if (delimiterIndex === -1) {
      console.warn(`区切り文字が無いためスキップしました: line=${index + 1}`);
      return;
    }

    const channelId = rawLine.slice(0, delimiterIndex).trim();
    const keyword = rawLine.slice(delimiterIndex + 1).trim();
    if (!channelId || !keyword) {
      console.warn(`channel_id もしくは alias が空のためスキップしました: line=${index + 1}`);
      return;
    }

    // channel_id + alias の組み合わせで重複を丁寧に除外します。
    const uniqueKey = `${channelId}::${keyword}`;
    if (seen.has(uniqueKey)) {
      return;
    }
    seen.add(uniqueKey);
    records.push({ channelId, keyword });
  });

  if (records.length === 0) {
    console.error("CSV から有効なデータを取得できませんでした。");
    process.exit(1);
  }

  const statements = [];
  statements.push("-- data/channels/channel_name_alias.csv から生成された SQL");
  if (!noTransaction) {
    statements.push("BEGIN TRANSACTION;");
  }
  if (!appendMode) {
    // append モードでなければ既存 alias を削除し、CSV の状態を忠実に反映させます。
    statements.push("DELETE FROM aliases;");
  }

  records.forEach(({ channelId, keyword }) => {
    const channelSql = escapeSqlLiteral(channelId);
    const keywordSql = escapeSqlLiteral(keyword);
    statements.push(
      [
        "INSERT INTO aliases (channel_id, keyword)",
        `SELECT '${channelSql}', '${keywordSql}'`,
        "WHERE NOT EXISTS (",
        `  SELECT 1 FROM aliases WHERE channel_id = '${channelSql}' AND keyword = '${keywordSql}'`,
        ");",
      ].join("\n"),
    );
  });

  if (!noTransaction) {
    statements.push("COMMIT;");
  }
  statements.push("");

  await writeFile(sqlOutputPath, statements.join("\n"), "utf8");
  console.log(
    `aliases 用の SQL を ${sqlOutputPath} に ${records.length} 件分出力しました。（append モード: ${appendMode}）`,
  );
  console.log(
    "ローカル DB へ即座に反映する場合は npx wrangler d1 execute lafter-db --local --file migrations-temp/aliases_seed.sql をご利用ください。",
  );
  console.log(
    "Durable Objects (remote) 環境など BEGIN/COMMIT が使えない場合は --no-transaction オプションを付けて SQL を生成し、npx wrangler d1 execute lafter-db --remote --file ... を実行してください。",
  );
  console.log(
    "append モードで既存データに追記したい場合は node scripts/import-channel-aliases.mjs --append を実行してください。（必要に応じて --no-transaction も併用可能です。）",
  );
}

// SQL リテラルに安全に変換する小さな関数です。
function escapeSqlLiteral(value) {
  return value.replaceAll("'", "''");
}

main().catch((error) => {
  console.error("aliases SQL 生成中にエラーが発生しました:", error);
  process.exit(1);
});
