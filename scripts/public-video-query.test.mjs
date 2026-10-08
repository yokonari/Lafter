// node --import tsx --test scripts/public-video-query.test.mjs
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { createPublicVideoQuery } from "../src/lib/public-video-query.ts";
import { channels, videos } from "../src/lib/schema.ts";
import { registerGetVideos } from "../src/app/api/[[...hono]]/routes/get-videos.ts";

function fixture() {
  // 本番データを書き換えず、Drizzleが生成したSQLを実際のSQLiteで実行します。
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE channels (id TEXT PRIMARY KEY, name TEXT, status INTEGER);
    CREATE TABLE aliases (id INTEGER PRIMARY KEY, keyword TEXT, channel_id TEXT);
    CREATE TABLE videos (
      id TEXT PRIMARY KEY, title TEXT, published_at TEXT, channel_id TEXT,
      status INTEGER, view_count INTEGER, like_count INTEGER
    );
    CREATE INDEX idx_videos_channel_status_published ON videos(channel_id, status, published_at);
    CREATE INDEX idx_videos_status ON videos(status);
    CREATE VIRTUAL TABLE videos_fts USING fts5(title, tokenize='trigram');
    INSERT INTO channels VALUES ('official', '公式', 1), ('media', 'メディア', 1), ('inactive', '非公開', 0);
    INSERT INTO videos VALUES
      ('v1', '公式動画', '2026-10-01', 'official', 1, 100, 10),
      ('v2', '浜村凡平太 コント', '2026-10-02', 'media', 3, 200, NULL),
      ('v3', '別の芸人', '2026-10-03', 'media', 1, 300, 30),
      ('v4', '浜村凡平太 非公開', '2026-10-04', 'media', 2, 400, 40),
      ('v5', '浜村凡平太 無効チャンネル', '2026-10-05', 'inactive', 1, NULL, NULL);
    INSERT INTO videos_fts(rowid, title) SELECT rowid, title FROM videos WHERE status IN (1, 3);
  `);
  const executed = [];
  // 本番と同じD1ドライバーに、ローカルSQLiteのprepare/bind/raw/allを渡します。
  const prepare = (query, params = []) => {
    const statement = sqlite.prepare(query);
    return {
      bind: (...values) => prepare(query, values),
      async raw() {
        executed.push(query);
        statement.setReturnArrays(true);
        return statement.all(...params);
      },
      async all() {
        executed.push(query);
        return { results: statement.all(...params), success: true };
      },
    };
  };
  const d1 = { prepare };
  const db = drizzle(d1);
  const where = and(
    inArray(videos.status, [1, 3]),
    eq(channels.status, 1),
    sql`videos.rowid IN (
      SELECT rowid FROM videos INDEXED BY idx_videos_channel_status_published WHERE channel_id = ${"official"}
      UNION SELECT rowid FROM videos_fts WHERE videos_fts MATCH ${"浜村凡平太"}
    )`,
  );
  return { sqlite, db, where, d1, executed };
}

test("芸人ページとキャッシュ生成のNOT INDEXEDクエリを生成・実行できる", async () => {
  const { sqlite, db, where } = fixture();
  try {
    const allQuery = createPublicVideoQuery(db, where, true).orderBy(desc(videos.publishedAt));
    const compiled = allQuery.toSQL();
    assert.match(compiled.sql, /NOT INDEXED/);
    const all = await allQuery;
    assert.deepEqual(all.map((row) => row.id), ["v2", "v1"]);
    assert.deepEqual(all[0], {
      id: "v2", title: "浜村凡平太 コント", publishedAt: "2026-10-02",
      channelId: "media", channelName: "メディア", viewCount: 200, likeCount: null,
    });
    const page = await createPublicVideoQuery(db, where, true)
      .orderBy(desc(videos.publishedAt)).limit(1).offset(1);
    assert.deepEqual(page, [all[1]]);
    // 500回避のためにNOT INDEXEDを外して、read削減を失っていないことも確認します。
    const plan = sqlite.prepare(`EXPLAIN QUERY PLAN ${compiled.sql}`).all(...compiled.params);
    assert.ok(plan.some((row) => /SEARCH videos USING INTEGER PRIMARY KEY/.test(row.detail)));
  } finally {
    sqlite.close();
  }
});

test("通常のテーブル参照とrowid候補検索で同じ結果を返す", async () => {
  const { sqlite, db, where } = fixture();
  try {
    for (const order of [videos.publishedAt, videos.viewCount, videos.likeCount]) {
      const normal = await createPublicVideoQuery(db, where, false).orderBy(desc(order));
      const lookup = await createPublicVideoQuery(db, where, true).orderBy(desc(order));
      assert.deepEqual(lookup, normal);
    }
    const empty = await createPublicVideoQuery(db, and(where, eq(videos.id, "missing")), true);
    assert.deepEqual(empty, []);
  } finally {
    sqlite.close();
  }
});

test("実際の動画APIがキャッシュ初回生成・ヒット・D1直接取得で200を返す", async () => {
  const { sqlite, d1, executed } = fixture();
  const contextKey = Symbol.for("__cloudflare-context__");
  const previousContext = globalThis[contextKey];
  const cache = new Map();
  const background = [];
  const kv = {
    async get(key) { return cache.get(key) ?? null; },
    async put(key, value) { cache.set(key, value); },
  };
  const context = { env: { DB: d1, LAFTER: kv }, ctx: { waitUntil: (task) => background.push(task) } };
  globalThis[contextKey] = context;
  try {
    const app = new Hono();
    registerGetVideos(app);
    const params = new URLSearchParams({
      artistSlug: "hamamura-test", channelIds: "official",
      channelIdsForQuery: "media,inactive", channelQuery: "浜村凡平太", limit: "1",
    });
    const cold = await app.request(`/videos?${params}`);
    assert.equal(cold.status, 200);
    const firstPage = await cold.json();
    assert.deepEqual(firstPage.videos.map((row) => row.id), ["v2"]);
    assert.equal(firstPage.hasNext, true);
    assert.equal(JSON.parse(cache.get("artist_videos_hamamura-test")).items.length, 2);
    assert.ok(cache.has("artist_videos_hamamura-test:stale"));

    const queriesAfterCold = executed.length;
    params.set("offset", "1");
    const hit = await app.request(`/videos?${params}`);
    assert.equal(hit.status, 200);
    assert.deepEqual((await hit.json()).videos.map((row) => row.id), ["v1"]);
    assert.equal(executed.length, queriesAfterCold);

    // KVが使えない場合も、同じ候補検索からページを返せます。
    delete context.env.LAFTER;
    const fallback = await app.request(`/videos?${params}`);
    assert.equal(fallback.status, 200);
    assert.deepEqual((await fallback.json()).videos.map((row) => row.id), ["v1"]);
    const search = await app.request(`/videos?q=${encodeURIComponent("浜村凡平太")}`);
    assert.equal(search.status, 200);
    assert.deepEqual((await search.json()).videos.map((row) => row.id), ["v2"]);
  } finally {
    await Promise.all(background);
    if (previousContext === undefined) delete globalThis[contextKey];
    else globalThis[contextKey] = previousContext;
    sqlite.close();
  }
});
