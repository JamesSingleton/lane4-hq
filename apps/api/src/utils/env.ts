import { z } from "zod";

const Env = z
  .object({
    NODE_ENV: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(8080),
    /** Comma-separated browser origins, e.g. the admin and web apps. */
    API_ALLOWED_ORIGINS: z.string().optional(),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    /** `owner/name` of the repo whose `desktop-v*` releases feed the updater. */
    DESKTOP_RELEASES_REPO: z
      .string()
      .regex(/^[\w.-]+\/[\w.-]+$/)
      .default("JamesSingleton/lane4-hq"),
    /** Read access to releases; required while the repo is private. */
    GITHUB_RELEASE_TOKEN: z.string().min(1).optional(),
  })
  .refine(
    (env) =>
      env.NODE_ENV !== "production" ||
      (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
    {
      message:
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production",
      path: ["UPSTASH_REDIS_REST_URL"],
    },
  );

export function apiEnv(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Env.parse(env);
  return {
    port: parsed.PORT,
    allowedOrigins:
      parsed.API_ALLOWED_ORIGINS?.split(",")
        .map((o) => o.trim())
        .filter(Boolean) ?? [],
    redis:
      parsed.UPSTASH_REDIS_REST_URL && parsed.UPSTASH_REDIS_REST_TOKEN
        ? {
            url: parsed.UPSTASH_REDIS_REST_URL,
            token: parsed.UPSTASH_REDIS_REST_TOKEN,
          }
        : null,
    desktopReleases: {
      repo: parsed.DESKTOP_RELEASES_REPO,
      token: parsed.GITHUB_RELEASE_TOKEN,
    },
  };
}
