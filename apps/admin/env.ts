import { keys as auth } from "@lane4hq/auth/keys";
import { keys as billing } from "@lane4hq/billing/keys";
import { keys as database } from "@lane4hq/db/keys";
import { keys as email } from "@lane4hq/emails/keys";
import { keys as storage } from "@lane4hq/storage/keys";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Composed env for the admin app. Import from `next.config` so missing
 * required vars fail the Vercel build instead of soft-defaulting at runtime.
 */
export const env = createEnv({
  skipValidation:
    process.env.SKIP_ENV_VALIDATION === "true" || process.env.VITEST === "true",
  emptyStringAsUndefined: true,
  extends: [auth(), billing(), database(), email(), storage()],
  server: {
    OPENAI_API_KEY: z.string().optional(),
    USA_SWIMMING_VENDOR_THUMBPRINT: z.string().optional(),
    USA_SWIMMING_API_URL: z.url().optional(),
    POSTHOG_API_KEY: z.string().optional(),
    POSTHOG_HOST: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_DOCS_URL: z.url().optional(),
    NEXT_PUBLIC_MARKETING_URL: z.url().optional(),
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
  },
  runtimeEnv: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    USA_SWIMMING_VENDOR_THUMBPRINT: process.env.USA_SWIMMING_VENDOR_THUMBPRINT,
    USA_SWIMMING_API_URL: process.env.USA_SWIMMING_API_URL,
    POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    NEXT_PUBLIC_DOCS_URL: process.env.NEXT_PUBLIC_DOCS_URL,
    NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN:
      process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
});
