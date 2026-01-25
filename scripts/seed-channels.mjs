#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

// JSON ファイルから全チャンネルIDを抽出し、channelsテーブルに事前登録するSQL を生成します。
async function main() {
  const rootDir = process.cwd();

  // JSONファイルのパス
  const agencyJsonPath = path.resolve(rootDir, "data/agencies/agency.json");
  const mediaJsonPath = path.resolve(rootDir, "data/media/media.json");
  const artistsJsonPath = path.resolve(rootDir, "data/artists/artists.json");

  const sqlOutputPath = path.resolve(rootDir, "migrations-temp/seed_channels.sql");

  // JSONファイルを読み込み
  const agencyData = JSON.parse(await readFile(agencyJsonPath, "utf8"));
  const mediaData = JSON.parse(await readFile(mediaJsonPath, "utf8"));
  const artistsData = JSON.parse(await readFile(artistsJsonPath, "utf8"));

  // 全チャンネルIDを抽出
  const channelIds = new Set();
  const channelNames = new Map(); // channelId -> name のマッピング

  // 1. agency.json からチャンネルを抽出
  for (const [agencyId, agency] of Object.entries(agencyData.agency)) {
    if (agency.channels && Array.isArray(agency.channels)) {
      for (const channel of agency.channels) {
        if (channel.channelId) {
          channelIds.add(channel.channelId);
          if (channel.name && !channelNames.has(channel.channelId)) {
            channelNames.set(channel.channelId, channel.name);
          }
        }
      }
    }
  }

  // 2. media.json からチャンネルを抽出
  if (mediaData.media && Array.isArray(mediaData.media)) {
    for (const media of mediaData.media) {
      if (media.channelId) {
        channelIds.add(media.channelId);
        if (media.name && !channelNames.has(media.channelId)) {
          channelNames.set(media.channelId, media.name);
        }
      }
    }
  }

  // 3. artists.json からチャンネルを抽出
  for (const [agencyId, agencyGroup] of Object.entries(artistsData.agency)) {
    if (agencyGroup.artists && Array.isArray(agencyGroup.artists)) {
      for (const artist of agencyGroup.artists) {
        if (artist.channels && Array.isArray(artist.channels)) {
          for (const channel of artist.channels) {
            if (channel.channelId) {
              channelIds.add(channel.channelId);
              // 芸人チャンネルには名前情報がないため、自動登録名をデフォルトとする
            }
          }
        }
      }
    }
  }

  console.log(`合計 ${channelIds.size} 個の一意なチャンネルIDを抽出しました。`);

  // SQL文を生成
  const statements = [];
  statements.push("-- JSONファイルから抽出したチャンネルIDをchannelsテーブルに事前登録");
  statements.push("-- 既存のチャンネルIDはスキップされます");
  statements.push("");

  for (const channelId of channelIds) {
    const channelIdEscaped = escapeSqlLiteral(channelId);
    const channelName = channelNames.get(channelId) || "(自動登録)";
    const channelNameEscaped = escapeSqlLiteral(channelName);
    const now = new Date().toISOString();

    statements.push(
      [
        "INSERT INTO channels (id, name, status, last_checked_at, created_at)",
        `SELECT '${channelIdEscaped}', '${channelNameEscaped}', 1, '${now}', '${now}'`,
        "WHERE NOT EXISTS (",
        `  SELECT 1 FROM channels WHERE id = '${channelIdEscaped}'`,
        ");",
      ].join("\n")
    );
  }

  statements.push("");

  // migrations-tempディレクトリを作成（存在しない場合）
  await mkdir(path.dirname(sqlOutputPath), { recursive: true });

  // SQLファイルを出力
  await writeFile(sqlOutputPath, statements.join("\n"), "utf8");

  console.log(`\nSQL ファイルを ${sqlOutputPath} に出力しました。`);
  console.log("\n次のコマンドでローカルDBに適用してください:");
  console.log(`  npx wrangler d1 execute lafter-db --local --file=${sqlOutputPath}`);
  console.log("\nリモートDBに適用する場合:");
  console.log(`  npx wrangler d1 execute lafter-db --remote --file=${sqlOutputPath}`);
}

// SQL リテラルに安全に変換する関数
function escapeSqlLiteral(value) {
  return value.replaceAll("'", "''");
}

main().catch((error) => {
  console.error("チャンネルシードSQL生成中にエラーが発生しました:", error);
  process.exit(1);
});
