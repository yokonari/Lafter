import type { Hono, Context } from "hono";
import type { KVNamespace } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { playlists, videos } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

const MAX_LIMIT = 20;

type ActiveChannelRecord = {
  channel_id?: string;
  channel_name?: string | null;
};

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

export function registerGetVideos(app: Hono<AdminEnv>) {
  app.get("/videos", async (c) => {
    const { env } = getCloudflareContext();
    // 型定義済みの env から安全に DB インスタンスを取得いたします。
    const db = createDatabase(env);
    const kv = env.LAFTER;
    if (!kv) {
      return c.json(
        { message: "Workers KV LAFTER バインディングが設定されていません。" },
        500,
      );
    }
    const cachedActiveChannelsText = await kv.get("active_channels", "text");
    if (!cachedActiveChannelsText) {
      return c.json(
        { message: "active_channels のキャッシュが存在しません。先に同期を実行してください。" },
        500,
      );
    }
    let cachedActiveChannels: ActiveChannelRecord[] = [];
    try {
      cachedActiveChannels = JSON.parse(cachedActiveChannelsText) as ActiveChannelRecord[];
    } catch {
      return c.json(
        { message: "active_channels の内容を JSON として解析できませんでした。" },
        500,
      );
    }
    const activeChannelMap = new Map<string, string>();
    for (const entry of cachedActiveChannels) {
      if (entry && typeof entry.channel_id === "string" && entry.channel_id) {
        activeChannelMap.set(entry.channel_id, entry.channel_name ?? "");
      }
    }
    const activeChannelIds = Array.from(activeChannelMap.keys());
    if (activeChannelIds.length === 0) {
      // 有効なチャンネルが存在しない場合は空データを返却し、余計なクエリを実行しません。
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
    const q = qRaw.trim();
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
    const channelIdsMatchingQuery: string[] = [];
    if (normalizedPatternsPerWord.length) {
      const matchedChannelIds = findChannelIdsByKeyword(
        activeChannelMap,
        normalizedPatternsPerWord,
      );
      channelIdsMatchingQuery.push(...matchedChannelIds);
    }

    const isCacheEligible =
      q.length === 0 && !channelIdFilter && normalizedPatternsPerWord.length === 0;

    if (isCacheEligible && mode === "new" && !shouldIncludePlaylists) {
      // トップ画面の「最近」専用に、最新500件のキャッシュを利用してDBへアクセスせず高速に返します。
      const latestCache = await loadCachedVideos(kv, "latest_active_videos");
      if (latestCache) {
        return respondWithCache(c, latestCache, safeOffset, safeLimit);
      }
      console.warn("[get-videos] latest_active_videos キャッシュが利用できなかったため DB で処理を継続します。");
    }

    if (isCacheEligible && mode === "random" && !shouldIncludePlaylists) {
      // トップ画面の「ランダム」専用に、事前に選定済みの500件をKVから配布します。
      const randomCache = await loadCachedVideos(kv, "random_active_videos");
      if (randomCache) {
        return respondWithCache(c, randomCache, safeOffset, safeLimit);
      }
      console.warn("[get-videos] random_active_videos キャッシュが利用できなかったため DB で処理を継続します。");
    }

    const videoConditions = [
      inArray(videos.status, [1, 3]),
      inArray(videos.channelId, activeChannelIds),
    ];
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

    // Workers KV に保存済みのチャンネル ID を用い、videos テーブル単体で対象レコードを丁寧に絞りこみます。
    const baseVideoQuery = db
      .select({
        id: videos.id,
        title: videos.title,
        publishedAt: videos.publishedAt,
        channelId: videos.channelId,
      })
      .from(videos)
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
        topVideoId: string | null;
      }>
      | [] = [];
    if (shouldIncludePlaylists) {
      const playlistConditions = [
        eq(playlists.status, 1),
        inArray(playlists.channelId, activeChannelIds),
      ];
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

      // Workers KV の情報に基づき、プレイリストはチャンネル ID のみを取得して名前は後段で丁寧に補います。
      playlistRows = await db
        .select({
          id: playlists.id,
          title: playlists.name,
          channelId: playlists.channelId,
          topVideoId: playlists.topVideoId,
        })
        .from(playlists)
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
      channel_name: activeChannelMap.get(row.channelId) ?? "",
      published_at: toUnixTime(row.publishedAt),
    }));

    const playlistsPayload = playlistRows.map((row) => ({
      id: row.id,
      // プレイリスト名も同様にエンティティを整えます。
      title: decodeHtmlEntities(row.title),
      channel_id: row.channelId,
      channel_name: row.channelId ? activeChannelMap.get(row.channelId) ?? "" : "",
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
): Response {
  const items = cache.items ?? [];
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
