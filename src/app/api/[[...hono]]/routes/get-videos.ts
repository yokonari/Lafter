import type { Hono, Context } from "hono";
import type { KVNamespace } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, desc, eq, gte, inArray, like, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { aliases, channels, videos } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AppDatabase } from "../context";
import type { AdminEnv } from "../types";

const MAX_LIMIT = 20;
const HOME_CACHE_LIMIT = 10; // ユーザートップ画面用のキャッシュ再抽選時は常に10件だけ返却します。
const MAX_QUERY_LENGTH = 256; // 検索クエリの最大文字数制限

type CachedVideoItem = {
  channel_id?: string;
  channel_name?: string | null;
  video_id?: string;
  video_title?: string;
  view_count?: number | null; // 再生数を追加
  like_count?: number | null; // 高評価数を追加
};

type LatestVideoCache = {
  updated_at?: string;
  items?: CachedVideoItem[];
};

type RandomVideoCache = {
  updated_at?: string;
  items?: CachedVideoItem[];
};

type ViewCountVideoCache = {
  updated_at?: string;
  items?: CachedVideoItem[];
};

/**
 * 検索クエリを安全にサニタイズする関数
 * - 文字コードを UTF-8 NFC 形式に正規化
 * - 制御文字（改行、タブ等）を除去
 * - 極端な連続スペースを単一スペースに置換
 * - 最大文字数を制限
 */
function sanitizeSearchQuery(rawQuery: string): string {
  if (!rawQuery) {
    return "";
  }

  // 1. UTF-8 NFC に正規化（合成形式に統一）
  let sanitized = rawQuery.normalize("NFC");

  // 2. 制御文字を除去（改行、タブ、NULL文字など）
  // Unicode 制御文字カテゴリ (Cc) を除去しますが、通常の空白は残します
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 3. 極端な連続スペース（半角・全角）を単一スペースに置換
  sanitized = sanitized.replace(/[\s\u3000]+/g, " ");

  // 4. 前後の空白を除去
  sanitized = sanitized.trim();

  // 5. 文字数制限（最大 256 文字）
  if (sanitized.length > MAX_QUERY_LENGTH) {
    sanitized = sanitized.slice(0, MAX_QUERY_LENGTH);
  }

  return sanitized;
}

export function registerGetVideos(app: Hono<AdminEnv>) {
  app.get("/videos", async (c) => {
    const { env } = getCloudflareContext();
    // 型定義済みの env から安全に DB インスタンスを取得いたします。
    const db = createDatabase(env);
    const kv = env.LAFTER ?? null;
    // 時々刻々と変化するチャンネル状況は DB から素直に取得し、KV 非依存で最新の状態を共有します。
    const activeChannelRows = await db
      .select({
        id: channels.id,
        name: channels.name,
      })
      .from(channels)
      .where(eq(channels.status, 1));
    const activeChannelMap = new Map<string, string>();
    for (const channel of activeChannelRows) {
      activeChannelMap.set(channel.id, channel.name ?? "");
    }
    if (activeChannelMap.size === 0) {
      // 有効なチャンネルが存在しない場合は空データを返却し、無駄なクエリを実行しません。
      return c.json(
        {
          videos: [],
          page: 1,
          limit: 0,
          hasNext: false,
        },
        200,
      );
    }

    // デバッグ: 生のURLと全パラメータをログ出力
    console.log("[get-videos] 生のURL:", c.req.url);
    console.log("[get-videos] 全クエリパラメータ:", Object.fromEntries(new URL(c.req.url).searchParams.entries()));
    const qRaw = c.req.query("q") ?? "";
    // デバッグ: 実際に受け取った検索クエリをログ出力
    console.log("[get-videos] 受け取った検索クエリ (raw):", qRaw);
    // サニタイズ処理: UTF-8正規化、制御文字除去、連続スペース除去、文字数制限
    const q = sanitizeSearchQuery(qRaw);
    console.log("[get-videos] サニタイズ後の検索クエリ:", q);
    // 複数キーワードは半角・全角スペースで区切り、すべてを AND で満たすように扱います。
    // 「ダ/ダ」などの正規化差異も吸収するため、NFC/NFD 両方のパターンを用意します。
    const keywords = q ? q.split(/\s+/u).filter(Boolean) : [];
    const normalizedPatternsPerWord = keywords.map((word) => buildLikePatterns(word));
    const mode = c.req.query("mode");

    const period = c.req.query("period") ?? "month"; // 期間フィルタ: all, month, year
    const sort = c.req.query("sort") ?? "published"; // ソート順フィルタ: published, popular, views
    const channelIdFilter = c.req.query("channelId");
    // 複数チャンネル指定のため、カンマ区切りのIDを安全に分解します。
    const channelIdsParam = c.req.query("channelIds") ?? "";
    const channelIdsFilter = Array.from(
      new Set(
        channelIdsParam
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    );
    // role=official 以外のチャンネルに対してだけキーワード検索を適用するためのパラメータです。
    const channelQueryRaw = c.req.query("channelQuery") ?? "";
    const channelQuery = sanitizeSearchQuery(channelQueryRaw);
    // 「/」区切りで渡された別名を OR 条件として扱うため、まず候補のフレーズに分解します。
    const channelQueryPhrases = splitChannelQueryPhrases(channelQuery);
    const channelQueryPatternsPerPhrase = channelQueryPhrases
      .map((phrase) => phrase.split(/\s+/u).filter(Boolean).map((word) => buildLikePatterns(word)))
      .filter((patterns) => patterns.length > 0);
    const channelIdsForQueryParam = c.req.query("channelIdsForQuery") ?? "";
    const channelIdsForQuery = Array.from(
      new Set(
        channelIdsForQueryParam
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    );
    const offsetParam = Number(c.req.query("offset") ?? 0);
    const safeOffset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0;
    const limitParam = Number(c.req.query("limit") ?? MAX_LIMIT);
    const safeLimit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, MAX_LIMIT)
        : MAX_LIMIT;

    const isHomeParam = c.req.query("isHome");
    // userHome からの参照時のみ true を受け取り、キャッシュの再シャッフルを許可します。
    const shouldShuffleCacheForHome = isHomeParam === "true" || isHomeParam === "1";
    let channelIdsMatchingQuery: string[] = [];
    if (normalizedPatternsPerWord.length) {
      const matchedChannelIds = findChannelIdsByKeyword(
        activeChannelMap,
        normalizedPatternsPerWord,
      );
      // キーワードに紐づく別名も DB 側で丁寧に照会し、ユーザーが覚えやすい呼称でも確実にヒットさせます。
      const aliasMatchedChannelIds = await findChannelIdsByAliasKeyword(
        db,
        normalizedPatternsPerWord,
        activeChannelMap,
      );
      const combinedIds = new Set<string>([...matchedChannelIds, ...aliasMatchedChannelIds]);
      channelIdsMatchingQuery = Array.from(combinedIds);
    }

    const isCacheEligible =
      q.length === 0 &&
      !channelIdFilter &&
      channelIdsFilter.length === 0 &&
      channelIdsForQuery.length === 0 &&
      channelQueryPatternsPerPhrase.length === 0 &&
      normalizedPatternsPerWord.length === 0;

    if (kv && isCacheEligible && mode === "new") {
      // トップ画面の「最近」専用に、最新500件のキャッシュを利用してDBへアクセスせず高速に返します。
      const latestCache = await loadCachedVideos(kv, "latest_active_videos");
      if (latestCache) {
        // userHome からの要求のみシャッフル+10件に限定し、それ以外は既存順序で返します。
        const cacheLimit = shouldShuffleCacheForHome ? HOME_CACHE_LIMIT : safeLimit;
        return respondWithCache(
          c,
          latestCache,
          safeOffset,
          cacheLimit,
          shouldShuffleCacheForHome,
        );
      }
      console.warn("[get-videos] latest_active_videos キャッシュが利用できなかったため DB で処理を継続します。");
    }

    if (kv && isCacheEligible && mode === "random") {
      // トップ画面の「ランダム」専用に、事前に選定済みの500件をKVから配布します。
      const randomCache = await loadCachedVideos(kv, "random_active_videos");
      if (randomCache) {
        // ランダムキャッシュも同じく、userHome でのみ即時再抽選+10件を提供します。
        const cacheLimit = shouldShuffleCacheForHome ? HOME_CACHE_LIMIT : safeLimit;
        return respondWithCache(
          c,
          randomCache,
          safeOffset,
          cacheLimit,
          shouldShuffleCacheForHome,
        );
      }
      console.warn("[get-videos] random_active_videos キャッシュが利用できなかったため DB で処理を継続します。");
    }

    if (kv && isCacheEligible && mode === "popular") {
      // ホーム画面の場合は条件を固定: 1ヶ月以内の再生数順キャッシュをシャッフルして10件返します
      if (shouldShuffleCacheForHome) {
        const viewsCacheKey = "views_active_videos_month";
        const viewsCache = await loadCachedVideos(kv, viewsCacheKey);
        if (viewsCache) {
          return respondWithCache(c, viewsCache, 0, HOME_CACHE_LIMIT, true);
        }
        console.warn(
          "[get-videos] ホーム画面用の再生数動画キャッシュが利用できなかったため DB で処理を継続します。",
          viewsCacheKey,
        );
      } else {
        // 詳細画面や検索結果の場合は、sort パラメータに応じてキャッシュを取得します
        if (sort === "likes") {
          const likesCacheKey = resolveLikesCacheKey(period);
          const likesCache = await loadCachedVideos(kv, likesCacheKey);
          if (likesCache) {
            return respondWithCache(c, likesCache, safeOffset, safeLimit, false);
          }
          console.warn(
            "[get-videos] 高評価動画キャッシュが利用できなかったため DB で処理を継続します。",
            likesCacheKey,
          );
        } else {
          // sort が "views" または未指定の場合は再生数キャッシュを使用
          const viewsCacheKey = resolveViewsCacheKey(period);
          const viewsCache = await loadCachedVideos(kv, viewsCacheKey);
          if (viewsCache) {
            return respondWithCache(c, viewsCache, safeOffset, safeLimit, false);
          }
          console.warn(
            "[get-videos] 再生数動画キャッシュが利用できなかったため DB で処理を継続します。",
            viewsCacheKey,
          );
        }
      }
    }

    const videoConditions = [inArray(videos.status, [1, 3]), eq(channels.status, 1)];
    if (channelIdFilter) {
      // チャンネル指定がある場合は最優先でそのチャンネルに絞ります。
      videoConditions.push(eq(videos.channelId, channelIdFilter));
    } else {
      let channelScopeCondition: SQL<boolean> | null = null;
      if (channelIdsFilter.length > 0 && channelIdsForQuery.length > 0 && channelQueryPatternsPerPhrase.length > 0) {
        // official とそれ以外で条件を分け、非公式チャンネルにはキーワード検索を適用します。
        const keywordCondition = buildTitleKeywordConditionForPhrases(channelQueryPatternsPerPhrase);
        channelScopeCondition = or(
          inArray(videos.channelId, channelIdsFilter) as SQL<boolean>,
          and(inArray(videos.channelId, channelIdsForQuery) as SQL<boolean>, keywordCondition) as SQL<boolean>,
        ) as SQL<boolean>;
      } else if (channelIdsFilter.length > 0) {
        // 複数チャンネル指定時はまとめて対象に含めます。
        channelScopeCondition = inArray(videos.channelId, channelIdsFilter) as SQL<boolean>;
      } else if (channelIdsForQuery.length > 0 && channelQueryPatternsPerPhrase.length > 0) {
        // キーワード検索対象のチャンネルだけで絞り込みます。
        const keywordCondition = buildTitleKeywordConditionForPhrases(channelQueryPatternsPerPhrase);
        channelScopeCondition = and(
          inArray(videos.channelId, channelIdsForQuery) as SQL<boolean>,
          keywordCondition,
        ) as SQL<boolean>;
      }
      if (channelScopeCondition) {
        videoConditions.push(channelScopeCondition);
      }
    }

    // 人気度順モードの場合は使用しないため、条件を削除しました。
    // 再生数順の場合、view_count が NULL の動画を除外します。
    if (sort === "views" || mode === "views") {
      videoConditions.push(sql`${videos.viewCount} IS NOT NULL`);
    }
    if (sort === "likes") {
      videoConditions.push(sql`${videos.likeCount} IS NOT NULL`);
    }

    // 期間フィルタの適用: mode=popular の場合のみ期間フィルタを適用します。
    // mode=popular 時は sort パラメータ(views/likes)に関わらず期間フィルタを適用します。
    if (mode === "popular") {
      const now = new Date();
      if (period === "month") {
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        videoConditions.push(gte(videos.publishedAt, oneMonthAgo));
      } else if (period === "year") {
        const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
        videoConditions.push(gte(videos.publishedAt, oneYearAgo));
      }
      // period === "all" の場合はフィルタを追加しません
    }

    if (normalizedPatternsPerWord.length) {
      // キーワードごとに (タイトルLIKE または チャンネルID一致) を作り、すべて AND で縛ります。
      const keywordConditions: SQL<boolean>[] = normalizedPatternsPerWord.map((patterns) => {
        const titleMatches = patterns.map((pattern) => like(videos.title, pattern) as SQL<boolean>);
        const checks: SQL<boolean>[] = titleMatches;
        if (channelIdsMatchingQuery.length) {
          // inArray も SQL<unknown> を返すため、boolean 条件へそろえます。
          checks.push(inArray(videos.channelId, channelIdsMatchingQuery) as SQL<boolean>);
        }
        if (checks.length === 1) {
          return checks[0];
        }
        const combined = or(...checks);
        return combined as SQL<boolean>;
      });

      if (keywordConditions.length === 1) {
        videoConditions.push(keywordConditions[0]);
      } else if (keywordConditions.length > 1) {
        videoConditions.push(and(...keywordConditions) as SQL<boolean>);
      }
    }
    const videoWhere =
      videoConditions.length === 1 ? videoConditions[0] : and(...videoConditions);

    // DB 上の channels.status=1 を直接参照しながら、videos テーブルから対象レコードを丁寧に抽出します。
    const baseVideoQuery = db
      .select({
        id: videos.id,
        title: videos.title,
        publishedAt: videos.publishedAt,
        channelId: videos.channelId,
        channelName: channels.name,
        viewCount: videos.viewCount, // 再生数を追加
        likeCount: videos.likeCount, // 高評価数を追加
      })
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(videoWhere);

    // ソート順の決定: sort パラメータを優先し、次に mode を参照します。
    let orderedVideoQuery;
    if (mode === "random") {
      // ランダムモードは常にランダムソート
      orderedVideoQuery = baseVideoQuery.orderBy(sql`RANDOM()`);
    } else if (sort === "views" || mode === "views" || (mode === "popular" && sort !== "likes")) {
      // 再生数順: view_count の降順、次に公開日の降順
      // 再生数モードも再生数でソートします
      // mode=popular でキャッシュがない場合も再生数順にソートします（sort=likes以外）
      orderedVideoQuery = baseVideoQuery.orderBy(desc(videos.viewCount), desc(videos.publishedAt));
    } else if (sort === "likes") {
      // 高評価順: like_count の降順、次に公開日の降順
      orderedVideoQuery = baseVideoQuery.orderBy(desc(videos.likeCount), desc(videos.publishedAt));
    } else {
      // デフォルトは公開日順
      orderedVideoQuery = baseVideoQuery.orderBy(desc(videos.publishedAt));
    }

    // ホーム画面の人気セクションでキャッシュがない場合、50件取得してシャッフルするため取得件数を調整します
    const fetchLimit = shouldShuffleCacheForHome && mode === "popular" ? 50 : safeLimit;

    // 追加取得分の1件を含めておき、次ページの有無を丁寧に判断します。
    const videoRowsRaw = await orderedVideoQuery.limit(fetchLimit + 1).offset(safeOffset);
    const hasNext = videoRowsRaw.length > fetchLimit;
    const videoRows = hasNext ? videoRowsRaw.slice(0, fetchLimit) : videoRowsRaw;



    const videosPayload = videoRows.map((row) => ({
      id: row.id,
      // YouTube 由来のタイトルに含まれる &quot; などのエンティティを丁寧にデコードします。
      title: decodeHtmlEntities(row.title),
      channel_id: row.channelId,
      channel_name: row.channelName ?? "",
      view_count: row.viewCount ?? undefined, // 再生数を追加
      like_count: row.likeCount ?? undefined, // 高評価数を追加
    }));

    // ホーム画面の人気セクションでキャッシュが使えなかった場合、DBから取得したデータをシャッフルします
    if (shouldShuffleCacheForHome && mode === "popular") {
      // Fisher-Yates シャッフルアルゴリズムを使用して50件全体をシャッフル
      for (let i = videosPayload.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [videosPayload[i], videosPayload[j]] = [videosPayload[j], videosPayload[i]];
      }
      // シャッフル後、上位10件のみを返す
      const slicedVideos = videosPayload.slice(0, HOME_CACHE_LIMIT);
      // 50件取得できていた場合、まだ続きがあることを示す
      const shuffledHasNext = videosPayload.length >= 50;

      return c.json(
        {
          videos: slicedVideos,
          page: 1,
          limit: HOME_CACHE_LIMIT,
          hasNext: shuffledHasNext,
        },
        200,
      );
    }



    return c.json(
      {
        videos: videosPayload,
        page: Math.floor(safeOffset / safeLimit) + 1,
        limit: safeLimit,
        hasNext,
      },
      200,
    );
  });
}

function buildLikePatterns(keyword: string): string[] {
  const variants = [keyword.normalize("NFC"), keyword.normalize("NFD")];
  const unique = Array.from(new Set(variants));
  return unique.map((word) => {
    const escaped = word.replace(/[%_]/g, (m) => `\\${m}`);
    return `%${escaped}%`;
  });
}

function splitChannelQueryPhrases(query: string): string[] {
  if (!query) {
    return [];
  }
  // 「/」や縦棒で区切られた別名をフレーズとして扱います。
  const parts = query
    .split(/[\/|｜]/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [query];
}

function buildTitleKeywordCondition(patternsPerWord: string[][]): SQL<boolean> {
  // NFC/NFD を含むタイトル一致条件を AND で束ね、名前検索用の判定に使います。
  const perWordConditions = patternsPerWord.map((patterns) => {
    const titleMatches = patterns.map((pattern) => like(videos.title, pattern) as SQL<boolean>);
    if (titleMatches.length === 1) {
      return titleMatches[0];
    }
    return or(...titleMatches) as SQL<boolean>;
  });
  if (perWordConditions.length === 0) {
    return sql`1 = 1` as SQL<boolean>;
  }
  if (perWordConditions.length === 1) {
    return perWordConditions[0];
  }
  return and(...perWordConditions) as SQL<boolean>;
}

function buildTitleKeywordConditionForPhrases(
  patternsPerPhrase: string[][][],
): SQL<boolean> {
  if (patternsPerPhrase.length === 0) {
    return sql`1 = 1` as SQL<boolean>;
  }
  const phraseConditions = patternsPerPhrase.map((patternsPerWord) =>
    buildTitleKeywordCondition(patternsPerWord),
  );
  if (phraseConditions.length === 1) {
    return phraseConditions[0];
  }
  // 複数の別名フレーズを OR で束ねて、いずれかが一致すればヒットさせます。
  return or(...phraseConditions) as SQL<boolean>;
}

function findChannelIdsByKeyword(
  channelMap: Map<string, string>,
  normalizedPatternsPerWord: string[][],
): string[] {
  const matches: string[] = [];
  for (const [channelId, channelName = ""] of channelMap.entries()) {
    const normalizedNameNfc = channelName.normalize("NFC").toLowerCase();
    const normalizedNameNfd = channelName.normalize("NFD").toLowerCase();
    let allWordsMatch = true;
    for (const patterns of normalizedPatternsPerWord) {
      let matched = false;
      for (const pattern of patterns) {
        const keyword = stripLikeWildcards(pattern);
        if (!keyword) {
          matched = true;
          break;
        }
        if (normalizedNameNfc.includes(keyword) || normalizedNameNfd.includes(keyword)) {
          matched = true;
          break;
        }
      }
      if (!matched) {
        allWordsMatch = false;
        break;
      }
    }
    if (allWordsMatch) {
      matches.push(channelId);
    }
  }
  return matches;
}

async function findChannelIdsByAliasKeyword(
  db: AppDatabase,
  normalizedPatternsPerWord: string[][],
  activeChannelMap: Map<string, string>,
): Promise<string[]> {
  // aliases テーブルの keyword を LIKE で丁寧に探索し、別名経由でも対象チャンネルを取りこぼさないようにいたします。
  if (!normalizedPatternsPerWord.length) {
    return [];
  }
  const aliasConditions: SQL<boolean>[] = normalizedPatternsPerWord.map((patterns) => {
    const likeConditions = patterns.map((pattern) => like(aliases.keyword, pattern) as SQL<boolean>);
    if (likeConditions.length === 1) {
      return likeConditions[0];
    }
    // キーワードの NFC/NFD どちらでもヒットできるよう、OR 結合した条件を丁寧に構築します。
    return or(...likeConditions) as SQL<boolean>;
  });
  if (!aliasConditions.length) {
    return [];
  }
  const aliasWhere =
    aliasConditions.length === 1
      ? aliasConditions[0]
      : (and(...aliasConditions) as SQL<boolean>);

  const aliasRows = await db
    .select({ channelId: aliases.channelId })
    .from(aliases)
    .where(aliasWhere);

  const channelIds: string[] = [];
  for (const row of aliasRows) {
    if (row.channelId && activeChannelMap.has(row.channelId)) {
      // アクティブなチャンネルのみを丁寧に残し、不要な ID をここで除外します。
      channelIds.push(row.channelId);
    }
  }
  return Array.from(new Set(channelIds));
}

function stripLikeWildcards(pattern: string): string {
  const trimmed = pattern.replace(/^%/, "").replace(/%$/, "");
  return trimmed.replace(/\\([%_])/g, "$1").toLowerCase();
}



function decodeHtmlEntities(value: string): string {
  // 現状問題になっているダブルクォートやアポストロフィ、一般的な &amp; だけを安全にデコードします。
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

async function loadCachedVideos(
  kv: KVNamespace,
  key: string,
): Promise<LatestVideoCache | null> {
  try {
    const text = await kv.get(key, "text");
    if (!text) {
      return null;
    }
    const parsed = JSON.parse(text) as LatestVideoCache | RandomVideoCache | ViewCountVideoCache;
    if (!parsed || !Array.isArray(parsed.items)) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.error("[get-videos] KV キャッシュの取得に失敗しました。", key, error);
    return null;
  }
}

function respondWithCache(
  c: Context<AdminEnv>,
  cache: LatestVideoCache | RandomVideoCache | ViewCountVideoCache,
  offset: number,
  limit: number,
  shouldShuffle: boolean,
): Response {
  const items = [...(cache.items ?? [])];

  if (shouldShuffle) {
    // userHome 限定の再抽選ロジックでは、受け取ったキャッシュ全体を丁寧にシャッフルします。
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  }

  const startIndex = offset;
  const endIndex = offset + limit;
  const sliced = items.slice(startIndex, endIndex);
  const hasNext = endIndex < items.length;
  const videosPayload = sliced
    .filter((item) => typeof item?.video_id === "string" && item.video_id)
    .map((item) => ({
      id: item.video_id as string,
      title: decodeHtmlEntities(item?.video_title ?? ""),
      channel_id: item?.channel_id ?? "",
      channel_name: item?.channel_name ?? "",
      view_count: item?.view_count ?? undefined, // 再生数を追加
      like_count: item?.like_count ?? undefined, // 高評価数を追加
    }));

  const responseData = {
    videos: videosPayload,
    page: Math.floor(offset / limit) + 1,
    limit,
    hasNext,
  };

  // シャッフルする場合はブラウザキャッシュを無効化し、毎回新しい結果を取得できるようにします
  if (shouldShuffle) {
    return c.json(responseData, 200, {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    });
  }

  return c.json(responseData, 200);
}

function resolveViewsCacheKey(period: string): string {
  if (period === "all") {
    return "views_active_videos_all";
  }
  if (period === "year") {
    return "views_active_videos_year";
  }
  return "views_active_videos_month";
}

function resolveLikesCacheKey(period: string): string {
  if (period === "all") {
    return "likes_active_videos_all";
  }
  if (period === "year") {
    return "likes_active_videos_year";
  }
  return "likes_active_videos_month";
}
