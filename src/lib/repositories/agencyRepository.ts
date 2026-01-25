import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/app/api/[[...hono]]/context";
import { agencies, agencyChannels } from "@/lib/schema";

export class AgencyRepository {
  constructor(private db: AppDatabase) {}

  /**
   * 全事務所を取得
   */
  async getAll() {
    return await this.db
      .select()
      .from(agencies)
      .orderBy(agencies.displayOrder);
  }

  /**
   * 事務所ID→名前のマッピングを取得（agencyLabels.tsの置き換え）
   */
  async getLabels(): Promise<Record<string, string>> {
    const allAgencies = await this.getAll();
    const labels: Record<string, string> = {};

    for (const agency of allAgencies) {
      labels[agency.id] = agency.name;
    }

    return labels;
  }

  /**
   * 指定事務所のチャンネルID一覧を取得
   */
  async getChannelIds(agencyId: string): Promise<string[]> {
    const channels = await this.db
      .select({ channelId: agencyChannels.channelId })
      .from(agencyChannels)
      .where(eq(agencyChannels.agencyId, agencyId));

    return channels.map((ch) => ch.channelId);
  }

  /**
   * 指定事務所の詳細情報（チャンネル含む）を取得
   */
  async findById(agencyId: string) {
    const agency = await this.db.query.agencies.findFirst({
      where: eq(agencies.id, agencyId),
      with: {
        agencyChannels: true,
      },
    });

    return agency;
  }
}
