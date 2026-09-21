import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/lib/schema";

import { APIError } from "better-auth/api";

export const getAuth = (db: D1Database, allowedEmail?: string, authSecret?: string) => {
  const resolvedSecret = authSecret ?? process.env.BETTER_AUTH_SECRET;
  if (!resolvedSecret || resolvedSecret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters.");
  }

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
    secret: resolvedSecret,
    database: drizzleAdapter(drizzleDb, {
      provider: "sqlite",
      schema: authSchema,
    }),
    session: {
      // 個人運用の利便性と漏えい時の影響を両立するため、7日間有効にします。
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    emailAndPassword: {
      enabled: true,
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 10,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!allowedEmail) {
              throw new APIError("FORBIDDEN", {
                message: "管理者登録は現在許可されていません。",
              });
            }
            if (user.email.toLowerCase() !== allowedEmail.trim().toLowerCase()) {
              throw new APIError("FORBIDDEN", {
                message: "このメールアドレスは登録許可リストに含まれていません。",
              });
            }
          },
        },
      },
    },
  });
};
