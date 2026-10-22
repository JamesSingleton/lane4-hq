import { ANALYTICS_APPS, type AnalyticsApp } from "./catalog";

export type AnalyticsContext = {
  app: AnalyticsApp;
  environment: string;
  release: string;
  /** Admin traffic. Filter `internal = true` out of product analytics. */
  internal: boolean;
};

export function analyticsContext(input: {
  app: AnalyticsApp;
  environment?: string;
  release?: string;
  internal?: boolean;
}): AnalyticsContext {
  return {
    app: input.app,
    environment: (input.environment ?? "development").trim() || "development",
    release: (input.release ?? "dev").trim() || "dev",
    internal: input.internal ?? input.app === "admin",
  };
}

export function contextProperties(
  context: AnalyticsContext,
): Record<string, string | boolean> {
  const properties: Record<string, string | boolean> = {
    app: context.app,
    environment: context.environment,
    release: context.release,
  };
  if (context.internal) properties.internal = true;
  return properties;
}

export function isAnalyticsApp(value: string): value is AnalyticsApp {
  for (let i = 0; i < ANALYTICS_APPS.length; i++) {
    if (ANALYTICS_APPS[i] === value) return true;
  }
  return false;
}

/** Ingest host plus the asset host used by the Next.js `/ingest` proxy. */
export function posthogHosts(host?: string | null): {
  ingest: string;
  assets: string;
  ui: string;
} {
  const ingest = (host?.trim() || "https://us.i.posthog.com").replace(
    /\/+$/,
    "",
  );
  const assets = ingest.includes(".i.posthog.com")
    ? ingest.replace(".i.posthog.com", "-assets.i.posthog.com")
    : ingest;
  const ui = ingest.includes(".i.posthog.com")
    ? ingest.replace(".i.posthog.com", ".posthog.com")
    : ingest;
  return { ingest, assets, ui };
}

export function ingestRewrites(host?: string | null): Array<{
  source: string;
  destination: string;
}> {
  const hosts = posthogHosts(host);
  return [
    {
      source: "/ingest/static/:path*",
      destination: `${hosts.assets}/static/:path*`,
    },
    {
      source: "/ingest/array/:path*",
      destination: `${hosts.assets}/array/:path*`,
    },
    {
      source: "/ingest/:path*",
      destination: `${hosts.ingest}/:path*`,
    },
  ];
}
