import { MetadataRoute } from 'next'
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDatabase } from "@/app/api/[[...hono]]/context";
import { channels, artists } from "@/lib/schema";
import { eq } from "drizzle-orm";

/**
 * 常に動的レンダリングを強制し、リクエスト時に最新の DB 状態を反映したサイトマップを生成します。
 */
export const dynamic = 'force-dynamic';

const BASE_URL = 'https://lafter.day';

/**
 * Award Raceのページを動的に生成します。
 * 2020年から2025年までの全年度を含めます。
 * 新しい年度のページを作成したら、endYearを更新してください。
 */
function generateAwardRaceRoutes(): MetadataRoute.Sitemap {
    const startYear = 2020;
    const endYear = 2025; // 実際に存在する最新の年度
    const currentYear = new Date().getFullYear();
    const races = ['m1', 'koc'] as const;
    const routes: MetadataRoute.Sitemap = [];

    for (const race of races) {
        for (let year = startYear; year <= endYear; year++) {
            // 現在の年は更新頻度が高く、優先度も高い
            const isCurrentYear = year === currentYear;
            routes.push({
                url: `${BASE_URL}/award-race/${race}/${year}`,
                lastModified: new Date(),
                changeFrequency: isCurrentYear ? 'daily' : 'yearly',
                priority: isCurrentYear ? 0.8 : 0.7,
            });
        }
    }

    return routes;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const staticRoutes: MetadataRoute.Sitemap = [
        {
            url: BASE_URL,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 1,
        },
        {
            url: `${BASE_URL}/new`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.8,
        },
        {
            url: `${BASE_URL}/popular`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.8,
        },
        {
            url: `${BASE_URL}/random`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.6,
        },
        {
            url: `${BASE_URL}/award-race`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
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
        {
            url: `${BASE_URL}/comedian`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
    ];

    // Award Raceのページを動的に生成
    const awardRaceRoutes = generateAwardRaceRoutes();

    try {
        const { env } = getCloudflareContext();
        // ビルド時や一部の環境で env が取得できない場合の安全策
        if (!env || !env.DB) {
            console.warn('Environment or DB binding not found. Returning partial sitemap.');
            return [...staticRoutes, ...awardRaceRoutes];
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
            url: `${BASE_URL}/channel/${channel.id}`,
            lastModified: channel.createdAt ? new Date(channel.createdAt) : new Date(),
            changeFrequency: 'weekly',
            priority: 0.7,
        }));

        // 芸人ページを動的に生成
        const allArtists = await db
            .select({
                slug: artists.slug,
                updatedAt: artists.updatedAt,
            })
            .from(artists);

        const artistRoutes: MetadataRoute.Sitemap = allArtists.map((artist) => ({
            url: `${BASE_URL}/comedian/${artist.slug}`,
            lastModified: artist.updatedAt ? new Date(artist.updatedAt) : new Date(),
            changeFrequency: 'weekly',
            priority: 0.7,
        }));

        return [...staticRoutes, ...awardRaceRoutes, ...channelRoutes, ...artistRoutes];

    } catch (error) {
        console.error('Failed to generate dynamic sitemap:', error);
        // エラー時でも最低限静的なページとAward Raceのページは返却するようにします。
        return [...staticRoutes, ...awardRaceRoutes];
    }
}
