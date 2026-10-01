import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopReleases } from "../src/services/github";
import { githubDesktopReleases } from "../src/services/github";
import { testLogger } from "./fixtures";

vi.mock("@lane4hq/auth/server", () => ({
  auth: { api: { getSession: vi.fn() }, handler: vi.fn() },
}));
vi.mock("@lane4hq/db/authz", () => ({
  AuthError: class extends Error {},
  MEET_HOSTING_ROLES: [],
  requireTeamRole: vi.fn(),
  getUserTeams: vi.fn(),
}));
vi.mock("@lane4hq/db/queries/hosted-meets", () => ({}));
vi.mock("@lane4hq/db/queries/meets", () => ({}));

const { createApp } = await import("../src/app");

const REPO = "lane4/app";
const TAG = "https://github.com/lane4/app/releases/download/desktop-v0.2.0";
const MANIFEST = {
  version: "0.2.0",
  notes: "Faster heat sheets",
  pub_date: "2026-10-01T00:00:00Z",
  platforms: {
    "darwin-aarch64": { signature: "sig-mac", url: `${TAG}/Lane4.app.tar.gz` },
    "windows-x86_64": {
      signature: "sig-win",
      url: `${TAG}/Lane4_0.2.0_x64-setup.exe`,
    },
  },
};

const desktopRelease = {
  tag_name: "desktop-v0.2.0",
  draft: false,
  prerelease: false,
  assets: [
    { id: 11, name: "latest.json", url: "https://api.github.com/assets/11" },
    { id: 12, name: "Lane4.app.tar.gz", url: "https://api.github.com/a/12" },
    {
      id: 13,
      name: "Lane4_0.2.0_x64-setup.exe",
      url: "https://api.github.com/a/13",
    },
  ],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function fakeGitHub(releases: unknown[] = [desktopRelease]) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    const headers = init?.headers as Record<string, string>;
    if (href.endsWith("/releases?per_page=30")) return json(releases);
    if (href === "https://api.github.com/assets/11") {
      expect(headers.Accept).toBe("application/octet-stream");
      return json(MANIFEST);
    }
    if (href.includes("/releases/assets/")) {
      expect(init?.redirect).toBe("manual");
      return new Response(null, {
        status: 302,
        headers: {
          location: `https://objects.example/${href.split("/").pop()}`,
        },
      });
    }
    return json({}, 404);
  });
}

describe("githubDesktopReleases", () => {
  it("serves the newest desktop release with downloads through the API", async () => {
    const fetch = fakeGitHub([
      { ...desktopRelease, tag_name: "desktop-v0.3.0", draft: true },
      { tag_name: "api-v9", draft: false, prerelease: false, assets: [] },
      desktopRelease,
    ]);
    const releases = githubDesktopReleases({ repo: REPO, token: "t", fetch });
    const manifest = await releases.latestManifest("https://api/dl");
    expect(manifest).toEqual({
      ...MANIFEST,
      platforms: {
        "darwin-aarch64": { signature: "sig-mac", url: "https://api/dl/12" },
        "windows-x86_64": { signature: "sig-win", url: "https://api/dl/13" },
      },
    });
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer t",
    );
  });

  it("caches the lookup for five minutes", async () => {
    const fetch = fakeGitHub();
    let time = 0;
    const releases = githubDesktopReleases({
      repo: REPO,
      fetch,
      now: () => time,
    });
    await releases.latestManifest("x");
    await releases.latestManifest("x");
    expect(fetch).toHaveBeenCalledTimes(2);
    time = 5 * 60 * 1000 + 1;
    await releases.latestManifest("x");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("answers null when nothing is released", async () => {
    const releases = githubDesktopReleases({
      repo: REPO,
      fetch: fakeGitHub([]),
    });
    expect(await releases.latestManifest("x")).toBeNull();
    expect(await releases.assetDownloadUrl(12)).toBeNull();
  });

  it("only hands out assets of the newest desktop release", async () => {
    const releases = githubDesktopReleases({ repo: REPO, fetch: fakeGitHub() });
    expect(await releases.assetDownloadUrl(12)).toBe(
      "https://objects.example/12",
    );
    expect(await releases.assetDownloadUrl(999)).toBeNull();
  });

  it("retries after a failed lookup", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({}, 500))
      .mockImplementation(fakeGitHub());
    const releases = githubDesktopReleases({ repo: REPO, fetch });
    await expect(releases.latestManifest("x")).rejects.toThrow(/500/);
    await expect(releases.latestManifest("x")).resolves.not.toBeNull();
  });

  it("rejects a manifest pointing at files the release doesn't have", async () => {
    const fetch = fakeGitHub([
      { ...desktopRelease, assets: desktopRelease.assets.slice(0, 2) },
    ]);
    const releases = githubDesktopReleases({ repo: REPO, fetch });
    await expect(releases.latestManifest("x")).rejects.toThrow(
      /Lane4_0.2.0_x64-setup.exe/,
    );
  });

  it("fails loudly on unexpected GitHub answers", async () => {
    const badAsset = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("per_page=30")
        ? json([desktopRelease])
        : json({}, 403),
    );
    const releases = githubDesktopReleases({ repo: REPO, fetch: badAsset });
    await expect(releases.latestManifest("x")).rejects.toThrow(/403/);
  });

  it("fails when GitHub won't redirect to the download", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.endsWith("per_page=30")) return json([desktopRelease]);
      if (href.endsWith("/assets/11")) return json(MANIFEST);
      return json({}, 404);
    });
    const releases = githubDesktopReleases({ repo: REPO, fetch });
    await expect(releases.assetDownloadUrl(12)).rejects.toThrow(/404/);
  });
});

describe("desktop routes", () => {
  let releases: DesktopReleases;
  const logger = testLogger();

  beforeEach(() => {
    releases = {
      latestManifest: vi.fn(async (base: string) => ({
        ...MANIFEST,
        platforms: {
          "darwin-aarch64": { signature: "s", url: `${base}/12` },
        },
      })),
      assetDownloadUrl: vi.fn(async (id: number) =>
        id === 12 ? "https://objects.example/12" : null,
      ),
    };
  });

  it("returns the manifest without signing in", async () => {
    const app = createApp({
      allowedOrigins: [],
      logger,
      desktopReleases: releases,
    });
    const res = await app.request("https://api.lane4hq.com/v1/desktop/update", {
      headers: { "X-Forwarded-Proto": "https" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect((await res.json()).platforms["darwin-aarch64"].url).toBe(
      "https://api.lane4hq.com/v1/desktop/update/download/12",
    );
  });

  it("answers 204 with nothing to update to", async () => {
    vi.mocked(releases.latestManifest).mockResolvedValue(null);
    const app = createApp({
      allowedOrigins: [],
      logger,
      desktopReleases: releases,
    });
    expect((await app.request("/v1/desktop/update")).status).toBe(204);
    const unconfigured = createApp({ allowedOrigins: [], logger });
    expect((await unconfigured.request("/v1/desktop/update")).status).toBe(204);
  });

  it("answers 502 when GitHub fails", async () => {
    vi.mocked(releases.latestManifest).mockRejectedValue(new Error("down"));
    vi.mocked(releases.assetDownloadUrl).mockRejectedValue(new Error("down"));
    const app = createApp({
      allowedOrigins: [],
      logger,
      desktopReleases: releases,
    });
    expect((await app.request("/v1/desktop/update")).status).toBe(502);
    expect((await app.request("/v1/desktop/update/download/12")).status).toBe(
      502,
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it("redirects to the installer, and refuses other assets", async () => {
    const app = createApp({
      allowedOrigins: [],
      logger,
      desktopReleases: releases,
    });
    const ok = await app.request("/v1/desktop/update/download/12");
    expect(ok.status).toBe(302);
    expect(ok.headers.get("location")).toBe("https://objects.example/12");
    expect((await app.request("/v1/desktop/update/download/7")).status).toBe(
      404,
    );
    expect((await app.request("/v1/desktop/update/download/abc")).status).toBe(
      400,
    );
    const unconfigured = createApp({ allowedOrigins: [], logger });
    expect(
      (await unconfigured.request("/v1/desktop/update/download/12")).status,
    ).toBe(404);
  });
});
