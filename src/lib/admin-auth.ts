import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/lib/schema";

import { APIError } from "better-auth/api";

export const getAuth = (db: D1Database, allowedEmail?: string) => {
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
    session: {
      // 管理画面のログイン有効期限を 30 日に明示します。
      expiresIn: 60 * 60 * 24 * 30,
    },
    emailAndPassword: {
      enabled: true,
    },
    hooks: {
      before: {
        signUpEmail: async (ctx: { email: string }) => {
          if (!allowedEmail) {
            throw new APIError("FORBIDDEN", {
              message: "管理者登録は現在許可されていません。",
            });
          }
          if (ctx.email.toLowerCase() !== allowedEmail.trim().toLowerCase()) {
            throw new APIError("FORBIDDEN", {
              message: "このメールアドレスは登録許可リストに含まれていません。",
            });
          }
        },
      },
    },
  });
};
