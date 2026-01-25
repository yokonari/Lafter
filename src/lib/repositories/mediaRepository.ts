import type { AppDatabase } from "@/app/api/[[...hono]]/context";
import { mediaChannels } from "@/lib/schema";

export class MediaRepository {
  constructor(private db: AppDatabase) {}

  /**
   * 全メディアチャンネルを取得
   */
  async getAll() {
    return await this.db
      .select()
      .from(mediaChannels)
      .orderBy(mediaChannels.displayOrder);
  }

  /**
   * 全メディアチャンネルIDの配列を取得
   */
  async getAllChannelIds(): Promise<string[]> {
    const channels = await this.getAll();
    return channels.map((ch) => ch.channelId);
  }
}
