import type { D1Database, KVNamespace } from "@cloudflare/workers-types";

export const ACTIVE_CHANNELS_CACHE_KEY = "active_channels:v1";

export type ActiveChannel = {
  id: string;
  name: string;
};

type ActiveChannelsCache = {
  version: 1;
  updated_at: string;
  items: ActiveChannel[];
};

// 公開APIで共有するアクティブチャンネル一覧をKV優先で取得します。
export async function loadActiveChannels(
  db: D1Database,
  kv?: KVNamespace | null,
): Promise<ActiveChannel[]> {
  if (kv) {
    try {
      const cached = parseActiveChannelsCache(await kv.get(ACTIVE_CHANNELS_CACHE_KEY, "text"));
      if (cached) {
        return cached.items;
      }
    } catch (error) {
      console.error("[active-channels-cache] KVの読み込みに失敗しました。", error);
    }
  }

  const rows = await fetchActiveChannels(db);
  if (kv) {
    try {
      await saveActiveChannels(kv, rows);
    } catch (error) {
      // KV障害時もD1の取得結果を返し、公開APIを継続させます。
      console.error("[active-channels-cache] KVの自己修復に失敗しました。", error);
    }
  }
  return rows;
}

// チャンネルのステータス・名前変更後にD1正本からKVを再構築します。
export async function rebuildActiveChannelsCache(
  db: D1Database,
  kv: KVNamespace,
): Promise<ActiveChannel[]> {
  const rows = await fetchActiveChannels(db);
  await saveActiveChannels(kv, rows);
  return rows;
}

async function fetchActiveChannels(db: D1Database): Promise<ActiveChannel[]> {
  const result = await db
    .prepare("SELECT id, name FROM channels WHERE status = 1 ORDER BY id ASC")
    .all<ActiveChannel>();

  return Array.isArray(result.results)
    ? result.results.filter(isActiveChannel)
    : [];
}

async function saveActiveChannels(
  kv: KVNamespace,
  items: ActiveChannel[],
): Promise<void> {
  const payload: ActiveChannelsCache = {
    version: 1,
    updated_at: new Date().toISOString(),
    items,
  };
  await kv.put(ACTIVE_CHANNELS_CACHE_KEY, JSON.stringify(payload));
}

function parseActiveChannelsCache(value: string | null): ActiveChannelsCache | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<ActiveChannelsCache>;
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) {
      return null;
    }
    const items = parsed.items.filter(isActiveChannel);
    if (items.length !== parsed.items.length) {
      return null;
    }
    return {
      version: 1,
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : "",
      items,
    };
  } catch {
    return null;
  }
}

function isActiveChannel(value: unknown): value is ActiveChannel {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && row.id.length > 0 && typeof row.name === "string";
}
