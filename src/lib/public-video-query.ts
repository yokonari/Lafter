import { eq, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/app/api/[[...hono]]/context";
import { channels, videos } from "./schema";

type Video = typeof videos.$inferSelect;

// 表示用とキャッシュ生成用で、NOT INDEXEDを含む同じSELECTを使います。
export function createPublicVideoQuery(
  db: AppDatabase,
  where: SQL | undefined,
  useRowIdLookup: boolean,
) {
  return db
    .select({
      // 生SQLのFROMはDrizzleのテーブル検証対象外なので、列も型付きSQLで参照します。
      id: sql<Video["id"]>`${videos.id}`,
      title: sql<Video["title"]>`${videos.title}`,
      publishedAt: sql<Video["publishedAt"]>`${videos.publishedAt}`,
      channelId: sql<Video["channelId"]>`${videos.channelId}`,
      channelName: channels.name,
      viewCount: sql<Video["viewCount"]>`${videos.viewCount}`,
      likeCount: sql<Video["likeCount"]>`${videos.likeCount}`,
    })
    .from(useRowIdLookup ? sql.raw('videos AS "videos" NOT INDEXED') : videos)
    .innerJoin(channels, eq(videos.channelId, channels.id))
    .where(where);
}
