import { ingestRewrites } from "@lane4hq/analytics";
import { withPostHogConfig } from "@posthog/nextjs-config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Inlined into the browser bundle so instrumentation-client.ts can tag
  // events. VERCEL_ENV itself is not visible in client code.
  env: {
    NEXT_PUBLIC_LANE4_ENVIRONMENT:
      process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    NEXT_PUBLIC_LANE4_RELEASE:
      process.env.NEXT_PUBLIC_LANE4_RELEASE ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      "dev",
  },
  transpilePackages: ["@lane4hq/ui", "@lane4hq/analytics"],
  serverExternalPackages: ["posthog-node"],
  async rewrites() {
    return ingestRewrites(process.env.NEXT_PUBLIC_POSTHOG_HOST);
  },
};

function withSourceMaps(config: NextConfig): NextConfig {
  const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!personalApiKey || !projectId) return config;
  return withPostHogConfig(config, {
    personalApiKey,
    projectId,
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    sourcemaps: {
      enabled: true,
      releaseName: "lane4-web",
      releaseVersion:
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.NEXT_PUBLIC_LANE4_RELEASE ||
        "dev",
      deleteAfterUpload: true,
    },
  });
}

export default withSourceMaps(nextConfig);
