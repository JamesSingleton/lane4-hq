import { ingestRewrites } from "@lane4hq/analytics";
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

export default nextConfig;
