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
    artistName: text("artist_name"),
    category: integer("category"),
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
    isIncluded: integer("is_included").notNull().default(0),
    status: integer("status").notNull().default(0),
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
