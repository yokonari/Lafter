import { eq, like, or, and, sql } from "drizzle-orm";
import type { AppDatabase } from "@/app/api/[[...hono]]/context";
import { artists, artistStyles, artistChannels, artistAliases, agencies } from "@/lib/schema";
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
        aliases: true,
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
      aliases: artist.aliases.map((a) => ({
        name: a.name,
        kana: a.kana ?? undefined,
      })),
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

  /**
   * 管理画面用一覧取得（ページング・検索・フィルタ対応）
   */
  async getAdminList(options: {
    page: number;
    limit: number;
    keyword?: string;
    agencyId?: string;
    styleId?: string;
  }): Promise<{
    items: Array<{
      id: number;
      slug: string;
      name: string;
      kana: string | null;
      startedOn: string | null;
      agencyId: string;
      agencyName: string;
      styles: string[];
      channelCount: number;
      createdAt: string;
      updatedAt: string;
    }>;
    total: number;
    hasNext: boolean;
  }> {
    const { page, limit, keyword, agencyId, styleId } = options;
    const offset = (page - 1) * limit;

    // WHERE条件を構築
    const conditions = [];

    // キーワード検索（name または kana に部分一致）
    if (keyword) {
      const searchTerm = `%${keyword}%`;
      conditions.push(
        or(
          like(artists.name, searchTerm),
          like(artists.kana, searchTerm)
        )
      );
    }

    // 事務所フィルタ
    if (agencyId) {
      conditions.push(eq(artists.agencyId, agencyId));
    }

    // WHERE句を組み立て
    const whereClause = conditions.length > 0
      ? and(...conditions)
      : undefined;

    // 芸風フィルタがある場合は、artist_styles経由で絞り込み
    let artistIds: number[] | undefined;
    if (styleId) {
      const stylesResult = await this.db
        .select({ artistId: artistStyles.artistId })
        .from(artistStyles)
        .where(eq(artistStyles.styleId, styleId));
      artistIds = stylesResult.map(r => r.artistId);

      // 該当する芸人がいない場合は空結果を返す
      if (artistIds.length === 0) {
        return {
          items: [],
          total: 0,
          hasNext: false,
        };
      }
    }

    // 総件数を取得
    const countQuery = this.db
      .select({ count: sql<number>`count(*)` })
      .from(artists)
      .$dynamic();

    if (whereClause) {
      countQuery.where(whereClause);
    }

    if (artistIds) {
      countQuery.where(sql`${artists.id} IN ${artistIds}`);
    }

    const countResult = await countQuery;
    const total = countResult[0]?.count ?? 0;

    // データ取得（WITH句で事務所情報も取得）
    const query = this.db
      .select({
        id: artists.id,
        slug: artists.slug,
        name: artists.name,
        kana: artists.kana,
        startedOn: artists.startedOn,
        agencyId: artists.agencyId,
        agencyName: agencies.name,
        createdAt: artists.createdAt,
        updatedAt: artists.updatedAt,
      })
      .from(artists)
      .innerJoin(agencies, eq(artists.agencyId, agencies.id))
      .orderBy(artists.kana)
      .limit(limit)
      .offset(offset)
      .$dynamic();

    if (whereClause) {
      query.where(whereClause);
    }

    if (artistIds) {
      query.where(sql`${artists.id} IN ${artistIds}`);
    }

    const results = await query;

    // 各芸人の芸風とチャンネル数を取得
    const items = await Promise.all(
      results.map(async (artist) => {
        // 芸風取得
        const stylesResult = await this.db
          .select({ styleId: artistStyles.styleId })
          .from(artistStyles)
          .where(eq(artistStyles.artistId, artist.id));

        // チャンネル数取得
        const channelsResult = await this.db
          .select({ count: sql<number>`count(*)` })
          .from(artistChannels)
          .where(eq(artistChannels.artistId, artist.id));

        return {
          ...artist,
          styles: stylesResult.map(s => s.styleId),
          channelCount: channelsResult[0]?.count ?? 0,
        };
      })
    );

    const hasNext = offset + limit < total;

    return {
      items,
      total,
      hasNext,
    };
  }

  /**
   * 新規芸人作成
   */
  async create(data: {
    name: string;
    slug: string;
    kana?: string;
    startedOn?: string;
    agencyId: string;
    styles?: string[];
    channels?: Array<{ channelId: string; role: string; description?: string }>;
    aliases?: Array<{ name: string; kana?: string }>;
    description?: string;
  }): Promise<{ id: number; slug: string }> {
    // D1 は明示的なトランザクションをサポートしないため、順次実行します。
    const insertResult = await this.db.insert(artists).values({
      name: data.name,
      slug: data.slug,
      kana: data.kana ?? null,
      startedOn: data.startedOn ?? null,
      agencyId: data.agencyId,
      description: data.description ?? null,
    }).returning({ id: artists.id, slug: artists.slug });

    const artist = insertResult[0];
    if (!artist) {
      throw new Error("芸人の作成に失敗しました。");
    }

    // 芸風を挿入
    if (data.styles && data.styles.length > 0) {
      await this.db.insert(artistStyles).values(
        data.styles.map((styleId) => ({
          artistId: artist.id,
          styleId,
        }))
      );
    }

    // チャンネルを挿入
    if (data.channels && data.channels.length > 0) {
      await this.db.insert(artistChannels).values(
        data.channels.map((channel, index) => ({
          artistId: artist.id,
          channelId: channel.channelId,
          role: channel.role,
          description: channel.description ?? null,
          displayOrder: index,
        }))
      );
    }

    // 別名を挿入
    if (data.aliases && data.aliases.length > 0) {
      await this.db.insert(artistAliases).values(
        data.aliases.map((alias) => ({
          artistId: artist.id,
          name: alias.name,
          kana: alias.kana ?? null,
        }))
      );
    }

    return artist;
  }

  /**
   * 芸人情報更新
   */
  async update(id: number, data: {
    name?: string;
    slug?: string;
    kana?: string;
    startedOn?: string;
    agencyId?: string;
    styles?: string[];
    channels?: Array<{ channelId: string; role: string; description?: string }>;
    aliases?: Array<{ name: string; kana?: string }>;
    description?: string;
  }): Promise<{ id: number }> {
    // D1 互換のため、更新は順次実行します。
    // 基本情報を更新
    const updateData: Record<string, unknown> = {
      updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.kana !== undefined) updateData.kana = data.kana;
    if (data.startedOn !== undefined) updateData.startedOn = data.startedOn;
    if (data.agencyId !== undefined) updateData.agencyId = data.agencyId;
    if (data.description !== undefined) updateData.description = data.description;

    await this.db.update(artists)
      .set(updateData)
      .where(eq(artists.id, id));

    // 芸風を更新（全削除後に再挿入）
    if (data.styles !== undefined) {
      await this.db.delete(artistStyles).where(eq(artistStyles.artistId, id));
      if (data.styles.length > 0) {
        await this.db.insert(artistStyles).values(
          data.styles.map((styleId) => ({
            artistId: id,
            styleId,
          }))
        );
      }
    }

    // チャンネルを更新（全削除後に再挿入）
    if (data.channels !== undefined) {
      await this.db.delete(artistChannels).where(eq(artistChannels.artistId, id));
      if (data.channels.length > 0) {
        await this.db.insert(artistChannels).values(
          data.channels.map((channel, index) => ({
            artistId: id,
            channelId: channel.channelId,
            role: channel.role,
            description: channel.description ?? null,
            displayOrder: index,
          }))
        );
      }
    }

    // 別名を更新（全削除後に再挿入）
    if (data.aliases !== undefined) {
      await this.db.delete(artistAliases).where(eq(artistAliases.artistId, id));
      if (data.aliases.length > 0) {
        await this.db.insert(artistAliases).values(
          data.aliases.map((alias) => ({
            artistId: id,
            name: alias.name,
            kana: alias.kana ?? null,
          }))
        );
      }
    }

    return { id };
  }

  /**
   * 芸人削除（カスケード削除）
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.db
      .delete(artists)
      .where(eq(artists.id, id));

    return true;
  }

  /**
   * スラッグの一意性チェック
   */
  async isSlugUnique(slug: string, excludeId?: number): Promise<boolean> {
    const conditions = [eq(artists.slug, slug)];

    if (excludeId !== undefined) {
      conditions.push(sql`${artists.id} != ${excludeId}`);
    }

    const result = await this.db
      .select({ id: artists.id })
      .from(artists)
      .where(and(...conditions))
      .limit(1);

    return result.length === 0;
  }

  /**
   * 名前で芸人を検索（公開API用）
   * すべてのキーワードが名前に部分一致する芸人を返します。
   */
  async searchByName(query: string): Promise<{ slug: string; name: string }[]> {
    const keywords = query
      .split(/\s+/u)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2);
    if (keywords.length === 0) return [];

    const conditions = keywords.flatMap((word) => {
      const nfc = word.normalize("NFC");
      const nfd = word.normalize("NFD");
      const nfcPattern = `%${nfc}%`;
      const nfdPattern = `%${nfd}%`;
      if (nfc === nfd) {
        return [like(artists.name, nfcPattern)];
      }
      return [or(like(artists.name, nfcPattern), like(artists.name, nfdPattern))!];
    });

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    const rows = await this.db
      .select({ slug: artists.slug, name: artists.name })
      .from(artists)
      .where(whereClause)
      .limit(10);

    return rows;
  }

  /**
   * 芸人名の一意性チェック
   */
  async isNameUnique(name: string, excludeId?: number): Promise<boolean> {
    const conditions = [eq(artists.name, name)];

    if (excludeId !== undefined) {
      conditions.push(sql`${artists.id} != ${excludeId}`);
    }

    const result = await this.db
      .select({ id: artists.id })
      .from(artists)
      .where(and(...conditions))
      .limit(1);

    return result.length === 0;
  }
}
