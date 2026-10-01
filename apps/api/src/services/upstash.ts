import {
  RATE_LIMITS,
  type RateLimiter,
  type RateLimitRule,
} from "@api/rest/middleware/rate-limit";
import { Ratelimit } from "@upstash/ratelimit";
import type { Redis } from "@upstash/redis";

export function upstashRateLimiter(redis: Redis): RateLimiter {
  const limiters = {} as Record<RateLimitRule, Ratelimit>;
  for (const rule of Object.keys(RATE_LIMITS) as RateLimitRule[]) {
    const { requests, window } = RATE_LIMITS[rule];
    limiters[rule] = new Ratelimit({
      redis,
      prefix: `lane4:ratelimit:${rule}`,
      limiter: Ratelimit.slidingWindow(requests, window),
      ephemeralCache: new Map(),
      // A slow Redis lets the request through rather than stalling the deck.
      timeout: 1000,
      analytics: false,
    });
  }
  return async (rule, key) => {
    const { success, limit, remaining, reset } =
      await limiters[rule].limit(key);
    return { success, limit, remaining, reset };
  };
}
