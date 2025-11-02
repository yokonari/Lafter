import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/lib/schema";

export const getAuth = (db: D1Database) => {
  // Cloudflare D1 を用いた認証セットアップを丁寧に組み立てます。
  const drizzleDb = drizzle(db, { schema });
  const authSchema = {
    // Better Auth が期待するモデル名と既存テーブルを丁寧に対応付けます。
    user: schema.users,
    account: schema.accounts,
    session: schema.sessions,
    verification: schema.verifications,
  };
  // Drizzle インスタンスを丁寧に整えて Better Auth へお渡しいたします。
  return betterAuth({
    database: drizzleAdapter(drizzleDb, {
      provider: "sqlite",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
    },
  });
};
