import { createApp } from "@api/app";
import { githubDesktopReleases } from "@api/services/github";
import { upstashRateLimiter } from "@api/services/upstash";
import { apiEnv } from "@api/utils/env";
import { jsonLogger } from "@api/utils/logger";
import { serve } from "@hono/node-server";
import { closeDatabase, pingDatabase } from "@lane4hq/db/client";
import { Redis } from "@upstash/redis";

/** Railway waits `drainingSeconds` (15) before killing the container. */
const SHUTDOWN_TIMEOUT_MS = 12_000;

const logger = jsonLogger();
const env = apiEnv();
if (!env.redis) {
  logger.warn("Upstash Redis is not configured; rate limiting is off.");
}
const app = createApp({
  allowedOrigins: env.allowedOrigins,
  logger,
  rateLimiter: env.redis ? upstashRateLimiter(new Redis(env.redis)) : undefined,
  desktopReleases: githubDesktopReleases(env.desktopReleases),
  readiness: { database: pingDatabase },
});

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  logger.info("listening", { url: `http://localhost:${info.port}` });
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("shutting down", { signal });
  setTimeout(() => {
    logger.error("shutdown timed out");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
  server.close(async () => {
    try {
      await closeDatabase();
    } catch (error) {
      logger.error("closing the database failed", { error });
    }
    process.exit(0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("unhandled rejection", { error: reason });
});
process.on("uncaughtException", (error) => {
  // The process state is unknown after this; let Railway restart it.
  logger.error("uncaught exception", { error });
  process.exit(1);
});
