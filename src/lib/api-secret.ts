// 管理者向け API で利用する共有シークレットのヘッダー名を丁寧に定義します。
const HEADER_NAME = "x-api-secret";

type EnvSource = {
  API_SECRET?: string;
} | Partial<Record<string, unknown>> | undefined;

type ApiSecretStatusCode = 401 | 500;

export type ApiSecretValidationResult =
  | { ok: true }
  | { ok: false; status: ApiSecretStatusCode; message: string };

// Cloudflare 環境/Node.js から API シークレットを丁寧に取り出します。
function resolveExpectedSecret(env?: EnvSource): string | null {
  const candidates: Array<string | undefined> = [];
  if (env && typeof env.API_SECRET === "string") {
    candidates.push(env.API_SECRET);
  }
  if (typeof process.env.API_SECRET === "string") {
    candidates.push(process.env.API_SECRET);
  }
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

// リクエストヘッダーから送信されたシークレットを丁寧に抽出します。
function extractSecretFromHeaders(headers: Headers): string | null {
  const direct = headers.get(HEADER_NAME);
  if (direct && direct.trim() !== "") {
    return direct.trim();
  }
  const authorization = headers.get("authorization");
  if (!authorization) {
    return null;
  }
  const prefix = "bearer ";
  if (authorization.toLowerCase().startsWith(prefix)) {
    const token = authorization.slice(prefix.length).trim();
    return token ? token : null;
  }
  return null;
}

// API シークレットを検証し、失敗した場合は丁寧に理由を返却します。
export function verifyApiSecret(headers: Headers, env?: EnvSource): ApiSecretValidationResult {
  const expected = resolveExpectedSecret(env);
  if (!expected) {
    return {
      ok: false,
      status: 500,
      message: "API_SECRET が設定されていません。",
    };
  }
  const provided = extractSecretFromHeaders(headers);
  if (!provided || provided !== expected) {
    return {
      ok: false,
      status: 401,
      message: "管理者シークレットが正しくありません。",
    };
  }
  return { ok: true };
}

// ミドルウェア等で統一して利用できるよう、ヘッダー名も丁寧に公開します。
export const ADMIN_SECRET_HEADER = HEADER_NAME;
