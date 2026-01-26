import { type Hono } from "hono";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { createDatabase } from "../context";
import { agencies, agencyChannels, channels } from "@/lib/schema";

const channelSchema = z.object({
  channelId: z.string().min(1, "チャンネルIDは必須です。"),
  name: z.string().max(200, "チャンネル名は200文字以内で入力してください。").optional(),
});

const payloadSchema = z.object({
  channels: z.array(channelSchema),
});

export function registerPatchAdminAgencyChannels<
  E extends import("hono").Env,
  S extends import("hono").Schema,
  B extends string
>(app: Hono<E, S, B>) {
  app.patch("/admin/agency-channels", async (c) => {
    const agencyId = c.req.query("agencyId")?.trim() ?? "";
    if (!agencyId) {
      return c.json({ message: "agencyId を指定してください。" }, 400);
    }

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
      // 事務所の存在を確認します。
      const agency = await db
        .select({ id: agencies.id })
        .from(agencies)
        .where(eq(agencies.id, agencyId))
        .limit(1);
      if (agency.length === 0) {
        return c.json({ message: "指定された事務所が見つかりません。" }, 400);
      }

      const uniqueIds = Array.from(
        new Set(parseResult.data.channels.map((item) => item.channelId.trim()).filter(Boolean))
      );

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

      const inputNameMap = new Map(
        parseResult.data.channels
          .map((item) => [item.channelId.trim(), item.name?.trim() ?? ""] as const)
          .filter(([id]) => id)
      );

      // 既存の紐付けを削除してから最新の一覧を保存します。
      await db.delete(agencyChannels).where(eq(agencyChannels.agencyId, agencyId));
      if (uniqueIds.length > 0) {
        await db.insert(agencyChannels).values(
          uniqueIds.map((channelId) => ({
            agencyId,
            channelId,
            name:
              channelNameMap.get(channelId) ||
              inputNameMap.get(channelId) ||
              channelId,
          }))
        );
      }

      return c.json({ success: true, message: "事務所チャンネルを更新しました。" });
    } catch (error) {
      console.error("Update agency channels error:", error);
      return c.json(
        {
          message: "事務所チャンネルの更新中にエラーが発生しました。",
          error: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  });
}
