import {
  type UpdateManifest,
  updateManifestSchema,
} from "@api/schemas/desktop";

/** Desktop releases are tagged `desktop-v<version>`; other tags are ignored. */
const TAG_PREFIX = "desktop-v";
const MANIFEST_ASSET = "latest.json";
const CACHE_MS = 5 * 60 * 1000;

export type DesktopReleases = {
  /**
   * The newest published desktop release's Tauri manifest, with each download
   * pointing at `${downloadBase}/<assetId>`. Null when nothing is released.
   */
  latestManifest: (downloadBase: string) => Promise<UpdateManifest | null>;
  /**
   * A short-lived download URL for an asset of the newest desktop release.
   * Null for any other asset, so a private repo's other files stay private.
   */
  assetDownloadUrl: (assetId: number) => Promise<string | null>;
};

type Release = {
  manifest: UpdateManifest;
  assetIds: Map<string, number>;
};

type GitHubRelease = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: { id: number; name: string; url: string }[];
};

export function githubDesktopReleases(options: {
  /** `owner/name` */
  repo: string;
  /** Needed for private repos. */
  token?: string;
  fetch?: typeof fetch;
  now?: () => number;
}): DesktopReleases {
  const http = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const api = `https://api.github.com/repos/${options.repo}`;
  let cache: { at: number; release: Promise<Release | null> } | null = null;

  function headers(accept: string): Record<string, string> {
    return {
      Accept: accept,
      "User-Agent": "Lane4-Desktop-Updater",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    };
  }

  async function fetchLatest(): Promise<Release | null> {
    const res = await http(`${api}/releases?per_page=30`, {
      headers: headers("application/vnd.github+json"),
    });
    if (!res.ok) throw new Error(`GitHub releases answered ${res.status}`);
    const releases = (await res.json()) as GitHubRelease[];
    const release = releases.find(
      (r) =>
        !r.draft &&
        !r.prerelease &&
        r.tag_name.startsWith(TAG_PREFIX) &&
        r.assets.some((a) => a.name === MANIFEST_ASSET),
    );
    if (!release) return null;

    const manifestAsset = release.assets.find(
      (a) => a.name === MANIFEST_ASSET,
    ) as GitHubRelease["assets"][number];
    const manifestRes = await http(manifestAsset.url, {
      headers: headers("application/octet-stream"),
    });
    if (!manifestRes.ok) {
      throw new Error(`GitHub asset answered ${manifestRes.status}`);
    }
    const manifest = updateManifestSchema.parse(await manifestRes.json());
    return {
      manifest,
      assetIds: new Map(release.assets.map((a) => [a.name, a.id])),
    };
  }

  function latest(): Promise<Release | null> {
    if (!cache || now() - cache.at > CACHE_MS) {
      const release = fetchLatest();
      cache = { at: now(), release };
      // A failed lookup isn't cached; the next request tries again.
      release.catch(() => {
        if (cache?.release === release) cache = null;
      });
    }
    return cache.release;
  }

  return {
    async latestManifest(downloadBase) {
      const release = await latest();
      if (!release) return null;
      const platforms: UpdateManifest["platforms"] = {};
      for (const [platform, entry] of Object.entries(
        release.manifest.platforms,
      )) {
        const file = decodeURIComponent(
          new URL(entry.url).pathname.split("/").pop() ?? "",
        );
        const assetId = release.assetIds.get(file);
        if (assetId === undefined) {
          throw new Error(`Release has no asset named ${file}`);
        }
        platforms[platform] = { ...entry, url: `${downloadBase}/${assetId}` };
      }
      return { ...release.manifest, platforms };
    },

    async assetDownloadUrl(assetId) {
      const release = await latest();
      if (!release || ![...release.assetIds.values()].includes(assetId)) {
        return null;
      }
      const res = await http(`${api}/releases/assets/${assetId}`, {
        headers: headers("application/octet-stream"),
        redirect: "manual",
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) return location;
      throw new Error(`GitHub asset download answered ${res.status}`);
    },
  };
}
