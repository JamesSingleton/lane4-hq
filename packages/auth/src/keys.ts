import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    skipValidation:
      process.env.SKIP_ENV_VALIDATION === "true" ||
      process.env.VITEST === "true",
    emptyStringAsUndefined: true,
    server: {
      BETTER_AUTH_SECRET: z.string().min(32),
      BETTER_AUTH_URL: z.url(),
      BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
      POLAR_ACCESS_TOKEN: z.string().optional(),
      POLAR_WEBHOOK_SECRET: z.string().optional(),
      POLAR_PRODUCT_PRO: z.string().optional(),
      POLAR_PRODUCT_ENTERPRISE: z.string().optional(),
      POLAR_SERVER: z.enum(["sandbox", "production"]).optional(),
      GOOGLE_CLIENT_ID: z.string().optional(),
      GOOGLE_CLIENT_SECRET: z.string().optional(),
      MICROSOFT_CLIENT_ID: z.string().optional(),
      MICROSOFT_CLIENT_SECRET: z.string().optional(),
      MICROSOFT_TENANT_ID: z.string().optional(),
    },
    client: {
      NEXT_PUBLIC_BETTER_AUTH_URL: z.url().optional(),
    },
    runtimeEnv: {
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
      POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
      POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
      POLAR_PRODUCT_PRO: process.env.POLAR_PRODUCT_PRO,
      POLAR_PRODUCT_ENTERPRISE: process.env.POLAR_PRODUCT_ENTERPRISE,
      POLAR_SERVER: process.env.POLAR_SERVER,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
      MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
      MICROSOFT_TENANT_ID: process.env.MICROSOFT_TENANT_ID,
      NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    },
  });
