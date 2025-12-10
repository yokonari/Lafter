import type { Hono, Context } from "hono";
import type { KVNamespace } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { aliases, channels, playlists, videos } from "@/lib/schema";
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
};

type LatestVideoCache = {
  updated_at?: string;
  items?: CachedVideoItem[];
};

type RandomVideoCache = {
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
          play_lists: [],
          page: 1,
          limit: 0,
          hasNext: false,
        },
        200,
      );
    }

    const qRaw = c.req.query("q") ?? "";
    // サニタイズ処理: UTF-8正規化、制御文字除去、連続スペース除去、文字数制限
    const q = sanitizeSearchQuery(qRaw);
    // 複数キーワードは半角・全角スペースで区切り、すべてを AND で満たすように扱います。
    // 「ダ/ダ」などの正規化差異も吸収するため、NFC/NFD 両方のパターンを用意します。
    const keywords = q ? q.split(/\s+/u).filter(Boolean) : [];
    const normalizedPatternsPerWord = keywords.map((word) => buildLikePatterns(word));
    const mode = c.req.query("mode");
    const channelIdFilter = c.req.query("channelId");
    const offsetParam = Number(c.req.query("offset") ?? 0);
    const safeOffset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0;
    const limitParam = Number(c.req.query("limit") ?? MAX_LIMIT);
    const safeLimit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, MAX_LIMIT)
        : MAX_LIMIT;
    const includePlaylistsParam = c.req.query("includePlaylists");
    const shouldIncludePlaylists =
      includePlaylistsParam === "false" || includePlaylistsParam === "0" ? false : true;
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
      q.length === 0 && !channelIdFilter && normalizedPatternsPerWord.length === 0;

    if (kv && isCacheEligible && mode === "new" && !shouldIncludePlaylists) {
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

    if (kv && isCacheEligible && mode === "random" && !shouldIncludePlaylists) {
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

    const videoConditions = [inArray(videos.status, [1, 3]), eq(channels.status, 1)];
    if (channelIdFilter) {
      // チャンネル指定がある場合は最優先でそのチャンネルに絞ります。
      videoConditions.push(eq(videos.channelId, channelIdFilter));
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
      })
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(videoWhere);

    const orderedVideoQuery =
      mode === "random"
        ? baseVideoQuery.orderBy(sql`RANDOM()`)
        : baseVideoQuery.orderBy(desc(videos.publishedAt));

    // 追加取得分の1件を含めておき、次ページの有無を丁寧に判断します。
    const videoRowsRaw = await orderedVideoQuery.limit(safeLimit + 1).offset(safeOffset);
    const hasNext = videoRowsRaw.length > safeLimit;
    const videoRows = hasNext ? videoRowsRaw.slice(0, safeLimit) : videoRowsRaw;

    let playlistRows:
      | Array<{
        id: string;
        title: string;
        channelId: string | null;
        channelName: string | null;
        topVideoId: string | null;
      }>
      | [] = [];
    if (shouldIncludePlaylists) {
      const playlistConditions = [eq(playlists.status, 1), eq(channels.status, 1)];
      if (channelIdFilter) {
        // チャンネルに紐づく動画一覧を閲覧している場合は、プレイリストも同一チャンネルに限定します。
        playlistConditions.push(eq(playlists.channelId, channelIdFilter));
      }
      if (normalizedPatternsPerWord.length) {
        // プレイリストもキーワードごとに AND で束ねます。
        const playlistKeywordConditions: SQL<boolean>[] = normalizedPatternsPerWord.map((patterns) => {
          const playlistNameMatches = patterns.map((pattern) => like(playlists.name, pattern) as SQL<boolean>);
          const checks: SQL<boolean>[] = playlistNameMatches;
          if (channelIdsMatchingQuery.length) {
            checks.push(inArray(playlists.channelId, channelIdsMatchingQuery) as SQL<boolean>);
          }
          if (checks.length === 1) {
            return checks[0];
          }
          const combinedPlaylistPattern = or(...checks);
          return combinedPlaylistPattern as SQL<boolean>;
        });

        if (playlistKeywordConditions.length === 1) {
          playlistConditions.push(playlistKeywordConditions[0]);
        } else if (playlistKeywordConditions.length > 1) {
          playlistConditions.push(and(...playlistKeywordConditions) as SQL<boolean>);
        }
      }
      const playlistWhere =
        playlistConditions.length === 1 ? playlistConditions[0] : and(...playlistConditions);

      // channels.status=1 を JOIN で参照しつつ、プレイリストとチャンネル名称を同時に整えます。
      playlistRows = await db
        .select({
          id: playlists.id,
          title: playlists.name,
          channelId: playlists.channelId,
          channelName: channels.name,
          topVideoId: playlists.topVideoId,
        })
        .from(playlists)
        .innerJoin(channels, eq(playlists.channelId, channels.id))
        .where(playlistWhere)
        .orderBy(desc(playlists.createdAt))
        .limit(safeLimit)
        .offset(safeOffset);
    }

    const videosPayload = videoRows.map((row) => ({
      id: row.id,
      // YouTube 由来のタイトルに含まれる &quot; などのエンティティを丁寧にデコードします。
      title: decodeHtmlEntities(row.title),
      channel_id: row.channelId,
      channel_name: row.channelName ?? "",
      published_at: toUnixTime(row.publishedAt),
    }));

    const playlistsPayload = playlistRows.map((row) => ({
      id: row.id,
      // プレイリスト名も同様にエンティティを整えます。
      title: decodeHtmlEntities(row.title),
      channel_id: row.channelId,
      channel_name: row.channelId ? row.channelName ?? "" : "",
      top_video_id: row.topVideoId,
    }));

    return c.json(
      {
        videos: videosPayload,
        play_lists: playlistsPayload,
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

function toUnixTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? Math.floor(time / 1000) : 0;
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

async function loadCachedVideos(kv: KVNamespace, key: string): Promise<LatestVideoCache | null> {
  try {
    const text = await kv.get(key, "text");
    if (!text) {
      return null;
    }
    const parsed = JSON.parse(text) as LatestVideoCache | RandomVideoCache;
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
  cache: LatestVideoCache | RandomVideoCache,
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
      published_at: 0,
    }));

  return c.json(
    {
      videos: videosPayload,
      play_lists: [],
      page: Math.floor(offset / limit) + 1,
      limit,
      hasNext,
    },
    200,
  );
}
