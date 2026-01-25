// src/lib/schema.ts
import {
  sqliteTable,
  text,
  integer,
  index,
  unique,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";

/* =========================
   channels
   ========================= */
export const channels = sqliteTable(
  "channels",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: integer("status").notNull().default(0),
    lastCheckedAt: text("last_checked_at"),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => ({
    idxChannelsStatus: index("idx_channels_status").on(table.status),
    // ステータスでの全件集計後に id を参照するケースも多いため、status, id の複合インデックスを丁寧に追加します。
    idxChannelsStatusId: index("idx_channels_status_id").on(table.status, table.id),
    // lastCheckedAt による並び替えや抽出が頻繁なため、status, lastCheckedAt, createdAt をまとめたインデックスも追加します。
    idxChannelsStatusLastCheckedAtCreatedAt: index("idx_channels_status_last_checked_created")
      .on(table.status, table.lastCheckedAt, table.createdAt),

  }),
);

/* =========================
   aliases
   ========================= */
export const aliases = sqliteTable(
  "aliases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // 検索キーワードからチャンネルへ丁寧に紐づけられるよう、必須の別名文字列を保持します。
    keyword: text("keyword").notNull(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade", onUpdate: "cascade" }),
  },
  (table) => ({
    // キーワード検索時の完全一致探索を高速化するために keyword 専用のインデックスを丁寧に用意します。
    idxAliasesKeyword: index("idx_aliases_keyword").on(table.keyword),
    // チャンネルに紐づく別名一覧を効率的に取得するための複合インデックスです。
    idxAliasesChannelKeyword: index("idx_aliases_channel_keyword").on(table.channelId, table.keyword),
  }),
);

/* =========================
   videos
   ========================= */
export const videos = sqliteTable(
  "videos",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade", onUpdate: "cascade" }),
    publishedAt: text("published_at"),
    status: integer("status").notNull().default(0),
    // 報告対応状況を丁寧に保持し、0 = 未処理 を初期値とします。
    reportStatus: integer("report_status").notNull().default(0),
    lastCheckedAt: text("last_checked_at"),
    // 動画の再生数を保持します(NULL可能)
    viewCount: integer("view_count"),
    // 動画のいいね数を保持します(NULL可能)
    likeCount: integer("like_count"),
    // 並び替え用の人気度スコアを保持します(NULL可能)
    popularityScore: integer("popularity_score"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => ({
    // status → channelId の順で参照する JOIN 集計にも対応するための複合インデックスです。
    idxVideosStatusChannel: index("idx_videos_status_channel").on(table.status, table.channelId),
    // 公開ステータスで絞りつつ published_at 降順+channelId での並び替えを行うクエリを最適化するためのカバリングインデックスです。
    idxVideosStatusPublishedChannel: index("idx_videos_status_published_channel")
      .on(table.status, table.publishedAt, table.channelId),
    idxVideosStatusPublished: index("idx_videos_status_published").on(
      table.status,
      table.publishedAt,
    ),
    // WHERE channel_id = ? AND status = 1 AND published_at >= ?
    idxVideosChannelStatusPublished: index(
      "idx_videos_channel_status_published",
    ).on(table.channelId, table.status, table.publishedAt),
    idxVideosStatusLastCheckedPublished: index(
      "idx_videos_status_last_checked_published",
    ).on(table.status, table.lastCheckedAt, table.publishedAt),
    // 再生数でのソートを最適化するための複合インデックスです (status, view_count DESC, published_at DESC)
    idxVideosStatusViewCountPublished: index(
      "idx_videos_status_view_count_published",
    ).on(table.status, table.viewCount, table.publishedAt),
    // 高評価数でのソートを最適化するための複合インデックスです (status, like_count DESC, published_at DESC)
    idxVideosStatusLikeCountPublished: index(
      "idx_videos_status_like_count_published",
    ).on(table.status, table.likeCount, table.publishedAt),
  }),
);



/* =========================
   search_logs
   ========================= */
export const searchLogs = sqliteTable(
  "search_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    keyword: text("keyword").notNull(),
    // 同一ワードの集計にも使えるよう、件数カラムを丁寧に追加します。
    count: integer("count").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
);

// サイトのユーザー（管理者のみ運用でも可）
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),                         // UUID（Better AuthのuserIdでもOK）
  email: text("email").notNull().unique(),             // ログイン用メール
  name: text("name").notNull().default(""),            // 表示名（Better Auth要件に合わせます）
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),                                   // メール確認フラグ
  image: text("image"),                                // プロフィール画像URL
  passwordHash: text("password_hash"),                 // argon2id / bcrypt などのハッシュ（Better Auth 利用時は accounts.password に保存されます）
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('now') * 1000 as integer))`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('now') * 1000 as integer))`),
});

/* =========================
   accounts
   ========================= */
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),                        // Better Auth のアカウント識別子
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  providerId: text("provider_id").notNull(),          // 認証プロバイダー識別子
  accountId: text("account_id").notNull(),            // プロバイダー側のアカウントID
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),                         // メール・パスワード認証向けのハッシュ格納先
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('now') * 1000 as integer))`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('now') * 1000 as integer))`),
});

/* =========================
   sessions
   ========================= */
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),                        // セッションID
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  token: text("token"),                               // セッション作成直後はトークン未生成のため丁寧に null を許容します
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(), // 有効期限
  ipAddress: text("ip_address"),                      // 発行元IP
  userAgent: text("user_agent"),                      // UA文字列
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('now') * 1000 as integer))`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('now') * 1000 as integer))`),
});

/* =========================
   verifications
   ========================= */
export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),                        // 検証ID
  identifier: text("identifier").notNull(),           // メールアドレスなどの識別子
  value: text("value").notNull(),                     // 検証トークン等
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(), // 有効期限
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('now') * 1000 as integer))`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('now') * 1000 as integer))`),
});

/* =========================
   agencies (事務所マスター)
   ========================= */
export const agencies = sqliteTable(
  "agencies",
  {
    // 事務所の一意識別子（例：grape, yoshimoto, watanabe）
    id: text("id").primaryKey(),
    // 事務所名（例：グレープカンパニー、吉本興業）
    name: text("name").notNull(),
    // 表示順序（五十音順または規模順でソート可能にする）
    displayOrder: integer("display_order").notNull().default(999),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => ({
    // 事務所名での検索を高速化
    idxAgenciesName: index("idx_agencies_name").on(table.name),
    // 表示順でのソートを最適化
    idxAgenciesDisplayOrder: index("idx_agencies_display_order").on(table.displayOrder),
  })
);

/* =========================
   agency_channels (事務所チャンネル)
   ========================= */
export const agencyChannels = sqliteTable(
  "agency_channels",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // 事務所ID（外部キー）
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade", onUpdate: "cascade" }),
    // チャンネルID（既存のchannelsテーブルと統合、外部キー制約）
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "restrict", onUpdate: "cascade" }),
    // チャンネル名（agency.jsonに含まれる名前情報）
    name: text("name").notNull(),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => ({
    // 事務所ごとのチャンネル取得を最適化
    idxAgencyChannelsAgencyId: index("idx_agency_channels_agency_id").on(table.agencyId),
    // チャンネルIDでの逆引きを高速化
    idxAgencyChannelsChannelId: index("idx_agency_channels_channel_id").on(table.channelId),
    // agencyId + channelId の組み合わせは一意
    uniqAgencyChannel: unique("uniq_agency_channel").on(table.agencyId, table.channelId),
  })
);

/* =========================
   media_channels (メディアチャンネル)
   ========================= */
export const mediaChannels = sqliteTable(
  "media_channels",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // チャンネルID（YouTubeチャンネルID、外部キー制約）
    channelId: text("channel_id")
      .notNull()
      .unique()
      .references(() => channels.id, { onDelete: "restrict", onUpdate: "cascade" }),
    // チャンネル名（例：ラフターナイト、コンテンツリーグ）
    name: text("name").notNull(),
    // 表示順序（メディアの重要度や優先度）
    displayOrder: integer("display_order").notNull().default(999),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => ({
    // チャンネルID検索を高速化
    idxMediaChannelsChannelId: index("idx_media_channels_channel_id").on(table.channelId),
    // 表示順でのソート最適化
    idxMediaChannelsDisplayOrder: index("idx_media_channels_display_order").on(table.displayOrder),
  })
);

/* =========================
   styles (芸風マスター)
   ========================= */
export const styles = sqliteTable(
  "styles",
  {
    // 芸風ID（例：manzai, konto, monomane）
    id: text("id").primaryKey(),
    // 芸風の表示名（例：漫才、コント、モノマネ）
    name: text("name").notNull(),
    // 表示順序（フィルタUIでの並び順）
    displayOrder: integer("display_order").notNull().default(999),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => ({
    // 名前検索を高速化
    idxStylesName: index("idx_styles_name").on(table.name),
    // 表示順でのソート最適化
    idxStylesDisplayOrder: index("idx_styles_display_order").on(table.displayOrder),
  })
);

/* =========================
   artists (芸人マスター)
   ========================= */
export const artists = sqliteTable(
  "artists",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // 芸人の一意識別子（URL slug）
    slug: text("slug").notNull().unique(),
    // 芸人名（例：ジャルジャル、サンドウィッチマン）
    name: text("name").notNull(),
    // 読み仮名（五十音順ソート用、ひらがな）
    kana: text("kana"),
    // 活動開始年（例：2003）
    startedOn: text("started_on"),
    // 補足説明（オプション、将来の拡張用）
    description: text("description"),
    // 所属事務所ID（外部キー）
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict", onUpdate: "cascade" }),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => ({
    // slug検索を最適化（芸人個別ページで使用）
    idxArtistsSlug: index("idx_artists_slug").on(table.slug),
    // 名前検索を高速化
    idxArtistsName: index("idx_artists_name").on(table.name),
    // 読み仮名でのソートを最適化
    idxArtistsKana: index("idx_artists_kana").on(table.kana),
    // 事務所ごとの芸人取得を最適化
    idxArtistsAgencyId: index("idx_artists_agency_id").on(table.agencyId),
    // 活動開始年でのフィルタリング・ソートを最適化
    idxArtistsStartedOn: index("idx_artists_started_on").on(table.startedOn),
    // 複合インデックス：事務所 + 読み仮名（ComedianIndexContentで使用）
    idxArtistsAgencyKana: index("idx_artists_agency_kana").on(table.agencyId, table.kana),
  })
);

/* =========================
   artist_channels (芸人チャンネル)
   ========================= */
export const artistChannels = sqliteTable(
  "artist_channels",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // 芸人ID（外部キー）
    artistId: integer("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade", onUpdate: "cascade" }),
    // チャンネルID（YouTubeチャンネルID、外部キー制約）
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "restrict", onUpdate: "cascade" }),
    // チャンネルの役割（"official" または "group"）
    role: text("role").notNull().default("official"),
    // オプション説明（将来の拡張用）
    description: text("description"),
    // 表示順序（複数チャンネルを持つ芸人の優先度）
    displayOrder: integer("display_order").notNull().default(0),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => ({
    // 芸人ごとのチャンネル取得を最適化
    idxArtistChannelsArtistId: index("idx_artist_channels_artist_id").on(table.artistId),
    // チャンネルIDでの逆引きを高速化
    idxArtistChannelsChannelId: index("idx_artist_channels_channel_id").on(table.channelId),
    // role別フィルタリングを最適化
    idxArtistChannelsRole: index("idx_artist_channels_role").on(table.role),
    // 芸人 + role の複合検索を最適化（UserHome.tsxで使用）
    idxArtistChannelsArtistRole: index("idx_artist_channels_artist_role").on(table.artistId, table.role),
    // artistId + channelId の組み合わせは一意
    uniqArtistChannel: unique("uniq_artist_channel").on(table.artistId, table.channelId),
  })
);

/* =========================
   artist_styles (芸人-芸風 中間テーブル)
   ========================= */
export const artistStyles = sqliteTable(
  "artist_styles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // 芸人ID（外部キー）
    artistId: integer("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade", onUpdate: "cascade" }),
    // 芸風ID（外部キー）
    styleId: text("style_id")
      .notNull()
      .references(() => styles.id, { onDelete: "cascade", onUpdate: "cascade" }),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => ({
    // 芸人ごとの芸風取得を最適化
    idxArtistStylesArtistId: index("idx_artist_styles_artist_id").on(table.artistId),
    // 芸風ごとの芸人検索を最適化（フィルタリングで使用）
    idxArtistStylesStyleId: index("idx_artist_styles_style_id").on(table.styleId),
    // artistId + styleId の組み合わせは一意
    uniqArtistStyle: unique("uniq_artist_style").on(table.artistId, table.styleId),
  })
);

/* =========================
   Relations (Drizzle ORM)
   ========================= */

// agencies のリレーション
export const agenciesRelations = relations(agencies, ({ many }) => ({
  artists: many(artists),
  agencyChannels: many(agencyChannels),
}));

// artists のリレーション
export const artistsRelations = relations(artists, ({ one, many }) => ({
  agency: one(agencies, {
    fields: [artists.agencyId],
    references: [agencies.id],
  }),
  channels: many(artistChannels),
  styles: many(artistStyles),
}));

// artistChannels のリレーション
export const artistChannelsRelations = relations(artistChannels, ({ one }) => ({
  artist: one(artists, {
    fields: [artistChannels.artistId],
    references: [artists.id],
  }),
  channel: one(channels, {
    fields: [artistChannels.channelId],
    references: [channels.id],
  }),
}));

// artistStyles のリレーション
export const artistStylesRelations = relations(artistStyles, ({ one }) => ({
  artist: one(artists, {
    fields: [artistStyles.artistId],
    references: [artists.id],
  }),
  style: one(styles, {
    fields: [artistStyles.styleId],
    references: [styles.id],
  }),
}));

// styles のリレーション
export const stylesRelations = relations(styles, ({ many }) => ({
  artists: many(artistStyles),
}));

// agencyChannels のリレーション
export const agencyChannelsRelations = relations(agencyChannels, ({ one }) => ({
  agency: one(agencies, {
    fields: [agencyChannels.agencyId],
    references: [agencies.id],
  }),
  channel: one(channels, {
    fields: [agencyChannels.channelId],
    references: [channels.id],
  }),
}));

// mediaChannels のリレーション
export const mediaChannelsRelations = relations(mediaChannels, ({ one }) => ({
  channel: one(channels, {
    fields: [mediaChannels.channelId],
    references: [channels.id],
  }),
}));
