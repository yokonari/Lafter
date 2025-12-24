import { MetadataRoute } from 'next'
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDatabase } from "@/app/api/[[...hono]]/context";
import { channels } from "@/lib/schema";
import { eq } from "drizzle-orm";

/**
 * 常に動的レンダリングを強制し、リクエスト時に最新の DB 状態を反映したサイトマップを生成します。
 */
export const dynamic = 'force-dynamic';

const BASE_URL = 'https://lafter.day';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const staticRoutes: MetadataRoute.Sitemap = [
        {
            url: BASE_URL,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 1,
        },
        {
            url: `${BASE_URL}/about`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${BASE_URL}/contact`,
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.5,
        },
        {
            url: `${BASE_URL}/policy`,
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.3,
        },
        {
            url: `${BASE_URL}/terms`,
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.3,
        },
    ];

    try {
        const { env } = getCloudflareContext();
        // ビルド時や一部の環境で env が取得できない場合の安全策
        if (!env || !env.DB) {
            console.warn('Environment or DB binding not found. Returning partial sitemap.');
            return staticRoutes;
        }

        const db = createDatabase(env);

        // アクティブなチャンネルのみを丁寧に取得します。
        const activeChannels = await db
            .select({
                id: channels.id,
                createdAt: channels.createdAt,
            })
            .from(channels)
            .where(eq(channels.status, 1));

        const channelRoutes: MetadataRoute.Sitemap = activeChannels.map((channel) => ({
            url: `${BASE_URL}/?channelId=${channel.id}`,
            lastModified: channel.createdAt ? new Date(channel.createdAt) : new Date(),
            changeFrequency: 'weekly',
            priority: 0.7,
        }));

        return [...staticRoutes, ...channelRoutes];

    } catch (error) {
        console.error('Failed to generate dynamic sitemap:', error);
        // エラー時でも最低限静的なページは返却するようにします。
        return staticRoutes;
    }
}
