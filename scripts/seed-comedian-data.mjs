#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

// 芸風ラベル（src/lib/styleLabels.ts から）
const STYLE_LABELS = {
  manzai: "漫才",
  konto: "コント",
  monomane: "モノマネ",
  utaneta: "歌",
  mandan: "漫談",
  gag: "ギャグ",
  flip: "フリップ",
  aruaru: "あるある",
  other: "その他",
};

// 芸風の表示順序
const STYLE_DISPLAY_ORDER = {
  manzai: 1,
  konto: 2,
  monomane: 3,
  utaneta: 4,
  mandan: 5,
  gag: 6,
  flip: 7,
  aruaru: 8,
  other: 99,
};

async function main() {
  const rootDir = process.cwd();

  // JSONファイルのパス
  const agencyJsonPath = path.resolve(rootDir, "data/agencies/agency.json");
  const mediaJsonPath = path.resolve(rootDir, "data/media/media.json");
  const artistsJsonPath = path.resolve(rootDir, "data/artists/artists.json");

  const sqlOutputPath = path.resolve(rootDir, "migrations-temp/seed_comedian_data.sql");

  // JSONファイルを読み込み
  const agencyData = JSON.parse(await readFile(agencyJsonPath, "utf8"));
  const mediaData = JSON.parse(await readFile(mediaJsonPath, "utf8"));
  const artistsData = JSON.parse(await readFile(artistsJsonPath, "utf8"));

  const statements = [];
  statements.push("-- コメディアンデータのシードSQL");
  statements.push("-- 実行順序: styles → agencies → agency_channels → media_channels → artists → artist_channels → artist_styles");
  statements.push("");

  // ===========================================
  // 1. styles テーブルをシード
  // ===========================================
  statements.push("-- 1. styles（芸風マスター）");
  for (const [styleId, styleName] of Object.entries(STYLE_LABELS)) {
    const styleIdEscaped = escapeSqlLiteral(styleId);
    const styleNameEscaped = escapeSqlLiteral(styleName);
    const displayOrder = STYLE_DISPLAY_ORDER[styleId] || 999;
    const now = new Date().toISOString();

    statements.push(
      [
        "INSERT INTO styles (id, name, display_order, created_at)",
        `SELECT '${styleIdEscaped}', '${styleNameEscaped}', ${displayOrder}, '${now}'`,
        "WHERE NOT EXISTS (",
        `  SELECT 1 FROM styles WHERE id = '${styleIdEscaped}'`,
        ");",
      ].join("\n")
    );
  }
  statements.push("");

  // ===========================================
  // 2. agencies テーブルをシード
  // ===========================================
  statements.push("-- 2. agencies（事務所マスター）");
  let agencyOrder = 0;
  for (const [agencyId, agency] of Object.entries(agencyData.agency)) {
    const agencyIdEscaped = escapeSqlLiteral(agencyId);
    const agencyNameEscaped = escapeSqlLiteral(agency.name);
    const now = new Date().toISOString();

    statements.push(
      [
        "INSERT INTO agencies (id, name, display_order, created_at, updated_at)",
        `SELECT '${agencyIdEscaped}', '${agencyNameEscaped}', ${agencyOrder}, '${now}', '${now}'`,
        "WHERE NOT EXISTS (",
        `  SELECT 1 FROM agencies WHERE id = '${agencyIdEscaped}'`,
        ");",
      ].join("\n")
    );
    agencyOrder++;
  }
  statements.push("");

  // ===========================================
  // 3. agency_channels テーブルをシード
  // ===========================================
  statements.push("-- 3. agency_channels（事務所チャンネル）");
  for (const [agencyId, agency] of Object.entries(agencyData.agency)) {
    if (agency.channels && Array.isArray(agency.channels)) {
      for (const channel of agency.channels) {
        const agencyIdEscaped = escapeSqlLiteral(agencyId);
        const channelIdEscaped = escapeSqlLiteral(channel.channelId);
        const channelNameEscaped = escapeSqlLiteral(channel.name);
        const now = new Date().toISOString();

        statements.push(
          [
            "INSERT INTO agency_channels (agency_id, channel_id, name, created_at)",
            `SELECT '${agencyIdEscaped}', '${channelIdEscaped}', '${channelNameEscaped}', '${now}'`,
            "WHERE NOT EXISTS (",
            `  SELECT 1 FROM agency_channels WHERE agency_id = '${agencyIdEscaped}' AND channel_id = '${channelIdEscaped}'`,
            ");",
          ].join("\n")
        );
      }
    }
  }
  statements.push("");

  // ===========================================
  // 4. media_channels テーブルをシード
  // ===========================================
  statements.push("-- 4. media_channels（メディアチャンネル）");
  let mediaOrder = 0;
  if (mediaData.media && Array.isArray(mediaData.media)) {
    for (const media of mediaData.media) {
      const channelIdEscaped = escapeSqlLiteral(media.channelId);
      const channelNameEscaped = escapeSqlLiteral(media.name);
      const now = new Date().toISOString();

      statements.push(
        [
          "INSERT INTO media_channels (channel_id, name, display_order, created_at)",
          `SELECT '${channelIdEscaped}', '${channelNameEscaped}', ${mediaOrder}, '${now}'`,
          "WHERE NOT EXISTS (",
          `  SELECT 1 FROM media_channels WHERE channel_id = '${channelIdEscaped}'`,
          ");",
        ].join("\n")
      );
      mediaOrder++;
    }
  }
  statements.push("");

  // ===========================================
  // 5-7. artists, artist_channels, artist_styles テーブルをシード
  // ===========================================
  statements.push("-- 5-7. artists, artist_channels, artist_styles（芸人マスター）");

  // artist_id を自動採番するためのカウンター（SQLite の AUTOINCREMENT を前提）
  // INSERT した後に last_insert_rowid() で取得するため、ここでは順序を保つだけ
  for (const [agencyId, agencyGroup] of Object.entries(artistsData.agency)) {
    if (agencyGroup.artists && Array.isArray(agencyGroup.artists)) {
      for (const artist of agencyGroup.artists) {
        const slugEscaped = escapeSqlLiteral(artist.slug);
        const nameEscaped = escapeSqlLiteral(artist.name);
        const kanaEscaped = artist.kana ? escapeSqlLiteral(artist.kana) : null;
        const startedOnEscaped = artist.startedOn ? escapeSqlLiteral(artist.startedOn) : null;
        const agencyIdEscaped = escapeSqlLiteral(agencyId);
        const now = new Date().toISOString();

        // artists テーブルへ挿入
        statements.push(`-- Artist: ${artist.name} (${artist.slug})`);
        statements.push(
          [
            "INSERT INTO artists (slug, name, kana, started_on, agency_id, created_at, updated_at)",
            `SELECT '${slugEscaped}', '${nameEscaped}', ${kanaEscaped ? `'${kanaEscaped}'` : "NULL"}, ${startedOnEscaped ? `'${startedOnEscaped}'` : "NULL"}, '${agencyIdEscaped}', '${now}', '${now}'`,
            "WHERE NOT EXISTS (",
            `  SELECT 1 FROM artists WHERE slug = '${slugEscaped}'`,
            ");",
          ].join("\n")
        );

        // artist_channels テーブルへ挿入
        if (artist.channels && Array.isArray(artist.channels)) {
          let channelOrder = 0;
          for (const channel of artist.channels) {
            const channelIdEscaped = escapeSqlLiteral(channel.channelId);
            const roleEscaped = escapeSqlLiteral(channel.role || "official");
            const descriptionEscaped = channel.description ? escapeSqlLiteral(channel.description) : null;

            statements.push(
              [
                "INSERT INTO artist_channels (artist_id, channel_id, role, description, display_order, created_at)",
                `SELECT (SELECT id FROM artists WHERE slug = '${slugEscaped}'), '${channelIdEscaped}', '${roleEscaped}', ${descriptionEscaped ? `'${descriptionEscaped}'` : "NULL"}, ${channelOrder}, '${now}'`,
                "WHERE NOT EXISTS (",
                `  SELECT 1 FROM artist_channels WHERE artist_id = (SELECT id FROM artists WHERE slug = '${slugEscaped}') AND channel_id = '${channelIdEscaped}'`,
                ");",
              ].join("\n")
            );
            channelOrder++;
          }
        }

        // artist_styles テーブルへ挿入
        if (artist.styles && Array.isArray(artist.styles)) {
          for (const styleId of artist.styles) {
            const styleIdEscaped = escapeSqlLiteral(styleId);

            statements.push(
              [
                "INSERT INTO artist_styles (artist_id, style_id, created_at)",
                `SELECT (SELECT id FROM artists WHERE slug = '${slugEscaped}'), '${styleIdEscaped}', '${now}'`,
                "WHERE NOT EXISTS (",
                `  SELECT 1 FROM artist_styles WHERE artist_id = (SELECT id FROM artists WHERE slug = '${slugEscaped}') AND style_id = '${styleIdEscaped}'`,
                ");",
              ].join("\n")
            );
          }
        }

        statements.push("");
      }
    }
  }

  // SQLファイルを出力
  await writeFile(sqlOutputPath, statements.join("\n"), "utf8");

  console.log(`\nSQL ファイルを ${sqlOutputPath} に出力しました。`);
  console.log(`合計 ${statements.length} 行のSQL文を生成しました。`);
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
  console.error("コメディアンデータシードSQL生成中にエラーが発生しました:", error);
  process.exit(1);
});
