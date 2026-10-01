import { describe, expect, it } from "vitest";
import { apiEnv } from "../src/utils/env";

describe("apiEnv", () => {
  it("defaults to port 8080, no browser origins, and Lane4's release repo", () => {
    expect(apiEnv({})).toEqual({
      port: 8080,
      allowedOrigins: [],
      redis: null,
      desktopReleases: { repo: "JamesSingleton/lane4-hq", token: undefined },
    });
  });

  it("reads Upstash credentials", () => {
    expect(
      apiEnv({
        UPSTASH_REDIS_REST_URL: "https://x.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "tok",
      }).redis,
    ).toEqual({ url: "https://x.upstash.io", token: "tok" });
  });

  it("requires Upstash in production", () => {
    expect(() => apiEnv({ NODE_ENV: "production" })).toThrow(/UPSTASH/);
  });

  it("reads PORT and a comma-separated origin list", () => {
    expect(
      apiEnv({
        PORT: "3000",
        API_ALLOWED_ORIGINS: "https://a.example, https://b.example,",
      }),
    ).toMatchObject({
      port: 3000,
      allowedOrigins: ["https://a.example", "https://b.example"],
    });
  });

  it("reads the desktop release repo and token", () => {
    expect(
      apiEnv({
        DESKTOP_RELEASES_REPO: "lane4/desktop",
        GITHUB_RELEASE_TOKEN: "ghp_x",
      }).desktopReleases,
    ).toEqual({ repo: "lane4/desktop", token: "ghp_x" });
    expect(() => apiEnv({ DESKTOP_RELEASES_REPO: "not a repo" })).toThrow();
  });
});
