import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { users } from "@/lib/schema";

export const auth = betterAuth({
    database: drizzleAdapter(users, {
        provider: "sqlite",
    }),
    emailAndPassword: {
      enabled: true,
    },
});
