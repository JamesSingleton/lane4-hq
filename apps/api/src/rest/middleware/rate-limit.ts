import type { ApiUser, AppEnv } from "@api/rest/types";
import { errorBody } from "@api/utils/errors";
import { createMiddleware } from "hono/factory";

/**
 * - `ip`: every `/v1` request, by client IP, before auth touches the database.
 * - `user`: signed-in reads, by user.
 * - `publish`: heat publishing, by user. A deck machine catching up after
 *   being offline drains its queue in a burst, so this is the loosest.
 */
export const RATE_LIMITS = {
  ip: { requests: 600, window: "1 m" },
  user: { requests: 120, window: "1 m" },
  publish: { requests: 600, window: "1 m" },
} as const satisfies Record<
  string,
  { requests: number; window: `${number} ${"s" | "m"}` }
>;

export type RateLimitRule = keyof typeof RATE_LIMITS;

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix time in milliseconds when the window resets. */
  reset: number;
};

export type RateLimiter = (
  rule: RateLimitRule,
  key: string,
) => Promise<RateLimitResult>;

export function rateLimit(rule: RateLimitRule) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const limiter = c.get("rateLimiter");
    if (!limiter) return next();

    const user = c.get("user") as ApiUser | undefined;
    const key =
      rule === "ip" || !user ? `ip:${c.get("clientIp") ?? "unknown"}` : user.id;

    let result: RateLimitResult;
    try {
      result = await limiter(rule, key);
    } catch (error) {
      // Rate limiting must never take publishing down with it.
      c.get("logger").error("rate limiter unavailable", {
        error,
        requestId: c.get("requestId"),
      });
      return next();
    }

    const resetSeconds = Math.max(
      0,
      Math.ceil((result.reset - Date.now()) / 1000),
    );
    c.header("RateLimit-Limit", String(result.limit));
    c.header("RateLimit-Remaining", String(Math.max(0, result.remaining)));
    c.header("RateLimit-Reset", String(resetSeconds));
    if (!result.success) {
      c.header("Retry-After", String(resetSeconds));
      return c.json(
        errorBody(
          "rate_limited",
          `Too many requests. Try again in ${resetSeconds} seconds.`,
        ),
        429,
      );
    }
    await next();
  });
}
