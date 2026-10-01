import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RateLimiter,
  RateLimitRule,
} from "../src/rest/middleware/rate-limit";
import { testLogger } from "./fixtures";

const mocks = vi.hoisted(() => ({
  ratelimits: [] as Array<{ prefix: string; limiter: string }>,
  limit: vi.fn(),
  getSession: vi.fn(),
  getUserTeams: vi.fn(),
  getPublishedHeats: vi.fn(),
  getHostedMeet: vi.fn(),
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = (n: number, w: string) => `${n}/${w}`;
    constructor(options: { prefix: string; limiter: string }) {
      mocks.ratelimits.push(options);
    }
    limit = mocks.limit;
  },
}));
vi.mock("@lane4hq/auth/server", () => ({
  auth: { api: { getSession: mocks.getSession }, handler: vi.fn() },
}));
vi.mock("@lane4hq/db/authz", () => ({
  AuthError: class extends Error {},
  MEET_HOSTING_ROLES: ["owner", "head_coach"],
  requireTeamRole: vi.fn(),
  getUserTeams: mocks.getUserTeams,
}));
vi.mock("@lane4hq/db/queries/hosted-meets", () => ({
  recordHeatPublication: vi.fn(),
  getHostedMeet: mocks.getHostedMeet,
  getHostedMeetsForOrganization: vi.fn(),
  getPublishedHeats: mocks.getPublishedHeats,
}));
vi.mock("@lane4hq/db/queries/meets", () => ({
  getMeets: vi.fn(),
  getMeetById: vi.fn(),
  getMeetEvents: vi.fn(),
}));

const { createApp } = await import("../src/app");
const { RATE_LIMITS } = await import("../src/rest/middleware/rate-limit");
const { upstashRateLimiter } = await import("../src/services/upstash");
const { getClientIp: clientIp } = await import("../src/rest/utils/ip");

const USER = { id: "u1", name: "Coach", email: "coach@example.com" };

function fakeLimiter(blocked: RateLimitRule | null = null) {
  const calls: Array<[RateLimitRule, string]> = [];
  const limiter: RateLimiter = async (rule, key) => {
    calls.push([rule, key]);
    return {
      success: rule !== blocked,
      limit: RATE_LIMITS[rule].requests,
      remaining: rule === blocked ? 0 : 41,
      reset: Date.now() + 30_000,
    };
  };
  return { limiter, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: USER, session: {} });
  mocks.getUserTeams.mockResolvedValue([]);
});

describe("upstashRateLimiter", () => {
  it("creates one sliding window per rule and reports the result", async () => {
    mocks.limit.mockResolvedValue({
      success: true,
      limit: 600,
      remaining: 599,
      reset: 123,
      pending: Promise.resolve(),
    });
    const limiter = upstashRateLimiter({} as never);
    expect(mocks.ratelimits.map((r) => [r.prefix, r.limiter])).toEqual([
      ["lane4:ratelimit:ip", "600/1 m"],
      ["lane4:ratelimit:user", "120/1 m"],
      ["lane4:ratelimit:publish", "600/1 m"],
    ]);
    expect(await limiter("publish", "u1")).toEqual({
      success: true,
      limit: 600,
      remaining: 599,
      reset: 123,
    });
    expect(mocks.limit).toHaveBeenCalledWith("u1");
  });
});

describe("rate limiting", () => {
  it("limits by IP before auth, then by user", async () => {
    const { limiter, calls } = fakeLimiter();
    const app = createApp({
      allowedOrigins: [],
      logger: testLogger(),
      rateLimiter: limiter,
    });
    const res = await app.request("/v1/me", {
      headers: { Authorization: "Bearer t", "X-Real-IP": "203.0.113.9" },
    });
    expect(res.status).toBe(200);
    expect(calls).toEqual([
      ["ip", "ip:203.0.113.9"],
      ["user", "u1"],
    ]);
    expect(res.headers.get("RateLimit-Limit")).toBe("120");
    expect(res.headers.get("RateLimit-Remaining")).toBe("41");
    expect(Number(res.headers.get("RateLimit-Reset"))).toBeGreaterThan(0);
  });

  it("answers 429 with Retry-After and skips auth when the IP is over", async () => {
    const { limiter } = fakeLimiter("ip");
    const app = createApp({
      allowedOrigins: [],
      logger: testLogger(),
      rateLimiter: limiter,
    });
    const res = await app.request("/v1/me", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("rate_limited");
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("gives publishing its own budget", async () => {
    const { limiter, calls } = fakeLimiter("publish");
    const app = createApp({
      allowedOrigins: [],
      logger: testLogger(),
      rateLimiter: limiter,
    });
    const res = await app.request("/v1/teams/t1/hosted-meets/m1/heats", {
      method: "POST",
      headers: {
        Authorization: "Bearer t",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(res.status).toBe(429);
    expect(calls.map(([rule]) => rule)).toEqual(["ip", "publish"]);
  });

  it("limits public results by IP only", async () => {
    mocks.getHostedMeet.mockResolvedValue(null);
    const { limiter, calls } = fakeLimiter();
    const app = createApp({
      allowedOrigins: [],
      logger: testLogger(),
      rateLimiter: limiter,
    });
    await app.request("/v1/hosted-meets/m1/results", {
      headers: { "X-Forwarded-For": "198.51.100.4, 10.0.0.1" },
    });
    expect(calls).toEqual([["ip", "ip:198.51.100.4"]]);
  });

  it("lets requests through when Redis fails", async () => {
    const logger = testLogger();
    const app = createApp({
      allowedOrigins: [],
      logger,
      rateLimiter: async () => {
        throw new Error("redis down");
      },
    });
    const res = await app.request("/v1/me", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(200);
    expect(logger.error).toHaveBeenCalled();
  });

  it("is off without a limiter", async () => {
    const app = createApp({ allowedOrigins: [], logger: testLogger() });
    const res = await app.request("/v1/me", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("RateLimit-Limit")).toBeNull();
  });

  it("falls back to unknown when no proxy header is present", async () => {
    const app = createApp({ allowedOrigins: [], logger: testLogger() });
    app.get("/ip", (c) => c.text(clientIp(c)));
    expect(await (await app.request("/ip")).text()).toBe("unknown");
  });
});
