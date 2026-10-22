import type { NextConfig } from "next";
import { env } from "./env";

void env;

const nextConfig: NextConfig = {
  devIndicators: false,
  transpilePackages: [
    "@lane4hq/ui",
    "@lane4hq/auth",
    "@lane4hq/db",
    "@lane4hq/emails",
  ],
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
