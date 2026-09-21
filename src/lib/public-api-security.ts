import type { KVNamespace } from "@cloudflare/workers-types";

type PublicPostOptions = {
  namespace: string;
  limit: number;
  windowSeconds: number;
  maxBodyBytes: number;
};

type JsonParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: Response };

function jsonError(status: number, message: string, headers?: HeadersInit) {
  return Response.json(
    { message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...headers,
      },
    },
  );
}

function getClientAddress(request: Request): string {
  const cloudflareAddress = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareAddress) return cloudflareAddress;

  const forwardedAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedAddress || "unknown";
}

async function hashIdentifier(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();

  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return false;
  }

  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/**
 * 公開 POST API に共通の同一オリジン・本文サイズ・IP レート制限を適用します。
 */
export async function protectPublicPost(
  request: Request,
  kv: KVNamespace | undefined,
  options: PublicPostOptions,
): Promise<Response | null> {
  if (!hasTrustedOrigin(request)) {
    return jsonError(403, "この送信元からのリクエストは受け付けられません。");
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return jsonError(415, "Content-Type は application/json を指定してください。");
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > options.maxBodyBytes) {
    return jsonError(413, "リクエスト本文が大きすぎます。");
  }

  // 制限用ストレージがない本番構成を見逃さないよう、安全側で拒否します。
  if (!kv) {
    console.error("Public API rate-limit storage is not configured", {
      namespace: options.namespace,
    });
    return jsonError(503, "現在この機能を利用できません。時間を置いて再度お試しください。");
  }

  const now = Date.now();
  const windowMilliseconds = options.windowSeconds * 1000;
  const bucket = Math.floor(now / windowMilliseconds);
  const identifier = await hashIdentifier(getClientAddress(request));
  const key = `security:rate:${options.namespace}:${bucket}:${identifier}`;
  const current = Number.parseInt((await kv.get(key)) ?? "0", 10) || 0;

  if (current >= options.limit) {
    const retryAfter = Math.max(1, Math.ceil(((bucket + 1) * windowMilliseconds - now) / 1000));
    return jsonError(
      429,
      "送信回数が上限に達しました。時間を置いて再度お試しください。",
      { "Retry-After": String(retryAfter) },
    );
  }

  await kv.put(key, String(current + 1), {
    expirationTtl: Math.max(60, options.windowSeconds + 60),
  });
  return null;
}

/** 本文全体を上限内で読み込み、巨大なチャンク転送も拒否します。 */
export async function parseLimitedJson<T>(
  request: Request,
  maxBodyBytes: number,
): Promise<JsonParseResult<T>> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: jsonError(400, "リクエスト本文を読み取れませんでした。") };
  }

  if (new TextEncoder().encode(text).byteLength > maxBodyBytes) {
    return { ok: false, response: jsonError(413, "リクエスト本文が大きすぎます。") };
  }

  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, response: jsonError(400, "JSON ボディを解析できませんでした。") };
  }
}
