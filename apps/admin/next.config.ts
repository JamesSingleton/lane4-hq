import { ingestRewrites } from "@lane4hq/analytics";
import { withPostHogConfig } from "@posthog/nextjs-config";
import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";
import { env } from "./env";

// Force env validation at build time (throws if required vars are missing).
void env;

const nextConfig: NextConfig = {
  devIndicators: false,
  // Next.js prints each Server Function call and its arguments in development.
  // Meet import passes the file text (names, birth dates, contact lines).
  logging: {
    serverFunctions: false,
  },
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
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.166"],
  ...(process.env.SCREENSHOT_DIST === "1"
    ? { distDir: ".next-screenshots" }
    : {}),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
    ];
  },
  transpilePackages: [
    "@lane4hq/ui",
    "@lane4hq/auth",
    "@lane4hq/db",
    "@lane4hq/emails",
    "@lane4hq/billing",
    "@lane4hq/swim-core",
    "@lane4hq/swim-formats",
    "@lane4hq/usa-swimming",
    "@lane4hq/reports",
    "@lane4hq/storage",
    "@lane4hq/analytics",
  ],
  serverExternalPackages: [
    "postgres",
    "xlsx",
    "fflate",
    "@polar-sh/sdk",
    "@react-pdf/renderer",
    "posthog-node",
  ],
  async rewrites() {
    return ingestRewrites(process.env.NEXT_PUBLIC_POSTHOG_HOST);
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
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
      releaseName: "lane4-admin",
      releaseVersion:
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.NEXT_PUBLIC_LANE4_RELEASE ||
        "dev",
      deleteAfterUpload: true,
    },
  });
}

export default withBotId(withSourceMaps(nextConfig));
