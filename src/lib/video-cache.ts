import type { KVNamespace } from "@cloudflare/workers-types";

export type VideoCache<T> = {
  updated_at: string;
  items: T[];
};

export type LoadedVideoCache<T> = {
  cache: VideoCache<T>;
  source: "primary" | "stale";
};

const STALE_SUFFIX = ":stale";

// 主キャッシュが欠損・破損していても、直前の正常値を返してD1への集中を防ぎます。
export async function loadVideoCache<T>(
  kv: KVNamespace,
  key: string,
): Promise<LoadedVideoCache<T> | null> {
  const candidates: Array<{ key: string; source: "primary" | "stale" }> = [
    { key, source: "primary" },
    { key: `${key}${STALE_SUFFIX}`, source: "stale" },
  ];

  for (const candidate of candidates) {
    try {
      const text = await kv.get(candidate.key, "text");
      const cache = parseVideoCache<T>(text);
      if (cache) {
        return { cache, source: candidate.source };
      }
    } catch (error) {
      console.error("[video-cache] KVキャッシュの取得に失敗しました。", candidate.key, error);
    }
  }
  return null;
}

// 更新前の正常値をstaleキーへ退避してから、新しい主キャッシュへ切り替えます。
export async function saveVideoCache<T>(
  kv: KVNamespace,
  key: string,
  items: T[],
): Promise<VideoCache<T>> {
  if (items.length === 0) {
    throw new Error(`空の動画キャッシュは保存しません: ${key}`);
  }

  const currentText = await kv.get(key, "text");
  if (parseVideoCache<T>(currentText)) {
    await kv.put(`${key}${STALE_SUFFIX}`, currentText as string);
  }

  const cache: VideoCache<T> = {
    updated_at: new Date().toISOString(),
    items,
  };
  await kv.put(key, JSON.stringify(cache));
  return cache;
}

function parseVideoCache<T>(text: string | null): VideoCache<T> | null {
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as Partial<VideoCache<T>>;
    if (typeof parsed.updated_at !== "string" || !Array.isArray(parsed.items)) {
      return null;
    }
    return parsed as VideoCache<T>;
  } catch {
    return null;
  }
}
