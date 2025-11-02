import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { users } from "@/lib/schema";

export const getAuth = (db: D1Database) => {
  // Cloudflare D1 を用いた認証セットアップを丁寧に組み立てます。
  return betterAuth({
    database: drizzleAdapter(users, {
      provider: "sqlite",
    }),
    emailAndPassword: {
      enabled: true,
    },
  });
};
