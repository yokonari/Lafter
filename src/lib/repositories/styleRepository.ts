import type { AppDatabase } from "@/app/api/[[...hono]]/context";
import { styles } from "@/lib/schema";

export class StyleRepository {
  constructor(private db: AppDatabase) {}

  /**
   * 全芸風を取得
   */
  async getAll() {
    return await this.db
      .select()
      .from(styles)
      .orderBy(styles.displayOrder);
  }

  /**
   * 芸風ID→名前のマッピングを取得
   */
  async getLabels(): Promise<Record<string, string>> {
    const allStyles = await this.getAll();
    const labels: Record<string, string> = {};

    for (const style of allStyles) {
      labels[style.id] = style.name;
    }

    return labels;
  }
}
