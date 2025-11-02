import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/schema.ts",
  out: "./drizzle",          // マイグレーション生成先
  casing: "snake_case",      // カラム名を snake_case で生成
});
