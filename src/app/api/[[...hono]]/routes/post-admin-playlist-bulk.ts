import type { Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { playlists } from "@/lib/schema";
import { createDatabase } from "../context";
import type { AdminEnv } from "../types";

type BulkPlaylistItem = {
  id?: unknown;
  status?: unknown;
};

type BulkPlaylistBody = {
  items?: BulkPlaylistItem[];
};

const MAX_ITEMS_PER_REQUEST = 100;

export function registerPostAdminPlaylistBulk(app: Hono<AdminEnv>) {
  app.post("/admin/play_list/bulk", async (c) => {
    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    const fail = (message: string, status: ContentfulStatusCode = 400) =>
      c.json({ message }, status);

    let body: BulkPlaylistBody;
    try {
      body = (await c.req.json()) as BulkPlaylistBody;
    } catch {
      return fail("リクエスト本文を JSON として解釈できませんでした。");
    }

    const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS_PER_REQUEST) : [];
    if (items.length === 0) {
      return fail("更新対象の items が指定されていません。");
    }

    let processed = 0;
    for (const [index, item] of items.entries()) {
      const path = `items[${index}]`;
      const playlistId = typeof item.id === "string" ? item.id.trim() : "";
      if (!playlistId) {
        return fail(`${path}.id は必須です。`);
      }

      const status = normalizeStatus(item.status);
      if (status === undefined) {
        return fail(`${path}.status には 1 または 2 を指定してください。`);
      }

      const [existing] = await db
        .select({ id: playlists.id })
        .from(playlists)
        .where(eq(playlists.id, playlistId))
        .limit(1);
      if (!existing) {
        return fail(`${path}.id に該当する再生リストが存在しません。`);
      }

      await db.update(playlists).set({ status }).where(eq(playlists.id, playlistId));
      processed += 1;
    }

    // まとめて反映した件数を丁寧にお知らせいたします。
    return c.json({ success: true, processed }, 200);
  });
}

function normalizeStatus(value: unknown): 1 | 2 | undefined {
  if (typeof value === "number" && (value === 1 || value === 2)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "1" || trimmed === "2") {
      return trimmed === "2" ? 2 : 1;
    }
  }
  return undefined;
}
