import OpenAI from "openai";
import { getCloudflareContext } from "@opennextjs/cloudflare";

let cachedClient: OpenAI | null = null;
let cachedApiKey: string | null = null;

function resolveApiKey(): string | null {
  if (cachedApiKey) {
    return cachedApiKey;
  }
  let apiKey: string | undefined;
  try {
    const { env } = getCloudflareContext();
    apiKey =
      env.OPENAI_API_KEY ??
      process.env.OPENAI_API_KEY ??
      "";
  } catch {
    // Cloudflare context が取得できない環境では process.env にフォールバック
  }
  if (!apiKey && typeof process.env.OPENAI_API_KEY === "string") {
    apiKey = process.env.OPENAI_API_KEY.trim();
  }
  if (!apiKey) {
    return null;
  }
  cachedApiKey = apiKey;
  return apiKey;
}

export function getOpenAIClient(): OpenAI | null {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey });
  }
  return cachedClient;
}
