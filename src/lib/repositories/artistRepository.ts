import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/app/api/[[...hono]]/context";
import { artists } from "@/lib/schema";
import type { ArtistWithAgency } from "../../../data/artists/types";

export class ArtistRepository {
  constructor(private db: AppDatabase) {}

  /**
   * 全芸人を取得（ArtistWithAgency[]形式）
   * flattenArtistsByAgency関数の置き換え
   */
  async getAllWithAgency(): Promise<ArtistWithAgency[]> {
    const allArtists = await this.db.query.artists.findMany({
      with: {
        channels: true,
        styles: {
          with: {
            style: true,
          },
        },
      },
      orderBy: (artists, { asc }) => [asc(artists.kana)],
    });

    return allArtists.map((artist) => ({
      slug: artist.slug,
      name: artist.name,
      kana: artist.kana ?? undefined,
      startedOn: artist.startedOn ?? undefined,
      description: artist.description ?? undefined,
      agencyId: artist.agencyId,
      channels: artist.channels.map((ch) => ({
        channelId: ch.channelId,
        role: ch.role,
        description: ch.description ?? undefined,
      })),
      styles: artist.styles.map((s) => s.styleId),
    }));
  }

  /**
   * slugで芸人を検索（芸人個別ページ用）
   */
  async findBySlug(slug: string) {
    const artist = await this.db.query.artists.findFirst({
      where: eq(artists.slug, slug),
      with: {
        agency: true,
        channels: true,
        styles: {
          with: {
            style: true,
          },
        },
      },
    });

    if (!artist) {
      return null;
    }

    return {
      slug: artist.slug,
      name: artist.name,
      kana: artist.kana ?? undefined,
      startedOn: artist.startedOn ?? undefined,
      description: artist.description ?? undefined,
      agencyId: artist.agencyId,
      agency: artist.agency,
      channels: artist.channels.map((ch) => ({
        channelId: ch.channelId,
        role: ch.role,
        description: ch.description ?? undefined,
      })),
      styles: artist.styles.map((s) => s.styleId),
    };
  }

  /**
   * フィルタ検索（事務所・芸風）
   */
  async findWithFilters(filters: {
    agencyId?: string;
    styleId?: string;
  }): Promise<ArtistWithAgency[]> {
    // 全芸人を取得してからフィルタリング（シンプルな実装）
    const allArtists = await this.getAllWithAgency();

    let filtered = allArtists;

    if (filters.agencyId) {
      filtered = filtered.filter((artist) => artist.agencyId === filters.agencyId);
    }

    if (filters.styleId) {
      const styleId = filters.styleId;
      filtered = filtered.filter((artist) => artist.styles?.includes(styleId));
    }

    return filtered;
  }

  /**
   * 芸人のチャンネルID取得（role別）
   */
  async getChannelIdsBySlug(slug: string, role?: string): Promise<string[]> {
    const artist = await this.db.query.artists.findFirst({
      where: eq(artists.slug, slug),
      with: {
        channels: true,
      },
    });

    if (!artist) {
      return [];
    }

    let channels = artist.channels;
    if (role) {
      channels = channels.filter((ch) => ch.role === role);
    }

    return channels.map((ch) => ch.channelId);
  }
}
