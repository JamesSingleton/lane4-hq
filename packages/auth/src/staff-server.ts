import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { staffDb } from "@lane4hq/db/client";
import * as schema from "@lane4hq/db/schema";
import { betterAuth } from "better-auth";
import { keys } from "./keys";

const env = keys();
const trustedOriginsFromEnv = env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** Sign-in for Lane4 staff. Sessions live in `staff_*` tables, not coach `user`. */
export const staffAuth = betterAuth({
  database: drizzleAdapter(staffDb, {
    provider: "pg",
    schema: {
      user: schema.staff,
      session: schema.staffSession,
      account: schema.staffAccount,
      verification: schema.staffVerification,
      rateLimit: schema.staffRateLimit,
    },
  }),
  appName: "Lane4 Ops",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  ...(trustedOriginsFromEnv?.length
    ? { trustedOrigins: trustedOriginsFromEnv }
    : process.env.NODE_ENV === "development"
      ? {
          trustedOrigins: async (request?: Request) => {
            const origin = request?.headers.get("origin");
            return origin ? [origin] : [];
          },
        }
      : {}),
  advanced: {
    cookiePrefix: "lane4-staff",
    database: { joins: true },
  },
  rateLimit: {
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 12,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
});
