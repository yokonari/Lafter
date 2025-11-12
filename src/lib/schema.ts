// src/lib/schema.ts
import {
  sqliteTable,
  text,
  integer,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/* =========================
   channels
   ========================= */
export const channels = sqliteTable(
  "channels",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: integer("status").notNull().default(0),
    searchCount: integer("search_count").notNull().default(0),
    keyword: text("keyword"),
    lastChecked: text("last_checked"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
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
    category: integer("category").default(0),
    status: integer("status").notNull().default(0),
    lastCheckedAt: text("last_checked_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
);

/* =========================
   playlists
   ========================= */
export const playlists = sqliteTable(
  "playlists",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade", onUpdate: "cascade" }),
    name: text("name").notNull(),
    status: integer("status").notNull().default(0),
    topVideoId: text("top_video_id"), // プレイリストの代表動画IDを任意で保持し、null も許容します。
    lastChecked: text("last_checked"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
);

/* =========================
   search_logs
   ========================= */
export const searchLogs = sqliteTable(
  "search_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    keyword: text("keyword").notNull(),
    channelId: text("channel_id").references(() => channels.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
);

// アプリのユーザー（管理者のみ運用でも可）
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
