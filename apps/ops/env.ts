import { keys as auth } from "@lane4hq/auth/keys";
import { keys as database } from "@lane4hq/db/keys";
import { keys as email } from "@lane4hq/emails/keys";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  skipValidation:
    process.env.SKIP_ENV_VALIDATION === "true" || process.env.VITEST === "true",
  emptyStringAsUndefined: true,
  extends: [auth(), database(), email()],
  server: {
    ADMIN_URL: z.url().optional(),
    GITHUB_RELEASE_TOKEN: z.string().min(1).optional(),
    DESKTOP_RELEASES_REPO: z.string().optional(),
  },
  client: {},
  runtimeEnv: {
    ADMIN_URL: process.env.ADMIN_URL,
    GITHUB_RELEASE_TOKEN: process.env.GITHUB_RELEASE_TOKEN,
    DESKTOP_RELEASES_REPO: process.env.DESKTOP_RELEASES_REPO,
  },
});
