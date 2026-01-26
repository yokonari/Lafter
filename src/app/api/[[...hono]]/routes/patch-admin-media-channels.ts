import { type Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { createDatabase } from "../context";
import { channels, mediaChannels } from "@/lib/schema";

const channelSchema = z.object({
  channelId: z.string().min(1, "チャンネルIDは必須です。"),
  name: z.string().max(200, "チャンネル名は200文字以内で入力してください。").optional(),
});

const payloadSchema = z.object({
  channels: z.array(channelSchema),
});

export function registerPatchAdminMediaChannels<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string
>(app: Hono<E, S, B>) {
  app.patch("/admin/media-channels", async (c) => {
    const json = await c.req.json().catch(() => null);
    const parseResult = payloadSchema.safeParse(json);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      return c.json(
        {
          message: firstError?.message ?? "入力データが正しくありません。",
          errors: parseResult.error.issues,
        },
        400
      );
    }

    const { env } = getCloudflareContext();
    const db = createDatabase(env);

    try {
      const uniqueIds: string[] = [];
      const seen = new Set<string>();
      for (const item of parseResult.data.channels) {
        const trimmed = item.channelId.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        uniqueIds.push(trimmed);
      }

      const channelNameMap = new Map<string, string>();
      if (uniqueIds.length > 0) {
        const channelRows = await db
          .select({ id: channels.id, name: channels.name })
          .from(channels)
          .where(inArray(channels.id, uniqueIds));
        for (const row of channelRows) {
          channelNameMap.set(row.id, row.name);
        }
      }

      // チャンネルが未登録の場合は分かりやすくエラーにします。
      if (channelNameMap.size !== uniqueIds.length) {
        const missing = uniqueIds.filter((id) => !channelNameMap.has(id));
        return c.json(
          { message: `未登録のチャンネルIDがあります: ${missing.join(", ")}` },
          400
        );
      }

      const inputNameMap = new Map(
        parseResult.data.channels
          .map((item) => [item.channelId.trim(), item.name?.trim() ?? ""] as const)
          .filter(([id]) => id)
      );

      // 既存の紐付けを削除してから最新の一覧を保存します。
      await db.delete(mediaChannels);
      if (uniqueIds.length > 0) {
        await db.insert(mediaChannels).values(
          uniqueIds.map((channelId, index) => ({
            channelId,
            name:
              channelNameMap.get(channelId) ||
              inputNameMap.get(channelId) ||
              channelId,
            displayOrder: index,
          }))
        );
      }

      return c.json({ success: true, message: "メディアチャンネルを更新しました。" });
    } catch (error) {
      console.error("Update media channels error:", error);
      return c.json(
        {
          message: "メディアチャンネルの更新中にエラーが発生しました。",
          error: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  });
}
