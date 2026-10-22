import { createApp } from "@api/app";
import { githubDesktopReleases } from "@api/services/github";
import { upstashRateLimiter } from "@api/services/upstash";
import { apiEnv } from "@api/utils/env";
import { jsonLogger } from "@api/utils/logger";
import { serve } from "@hono/node-server";
import { sendOtlpLogs } from "@lane4hq/analytics/logs";
import { getServerAnalytics } from "@lane4hq/analytics/server";
import { closeDatabase, pingDatabase } from "@lane4hq/db/client";
import { Redis } from "@upstash/redis";

/** Railway waits `drainingSeconds` (15) before killing the container. */
const SHUTDOWN_TIMEOUT_MS = 12_000;

const logger = jsonLogger();
const env = apiEnv();
if (!env.redis) {
  logger.warn("Upstash Redis is not configured; rate limiting is off.");
}
const analyticsEnvironment =
  process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV || "development";
const analyticsRelease =
  process.env.RAILWAY_GIT_COMMIT_SHA || process.env.LANE4_RELEASE || "dev";
const analytics = env.posthog
  ? getServerAnalytics({
      app: "api",
      apiKey: env.posthog.apiKey,
      host: env.posthog.host,
      environment: analyticsEnvironment,
      release: analyticsRelease,
    })
  : null;
const app = createApp({
  allowedOrigins: env.allowedOrigins,
  logger,
  rateLimiter: env.redis ? upstashRateLimiter(new Redis(env.redis)) : undefined,
  desktopReleases: githubDesktopReleases(env.desktopReleases),
  readiness: { database: pingDatabase },
  onRequest: env.posthog
    ? (event) => {
        const level =
          event.status >= 500 ? "error" : event.status >= 400 ? "warn" : "info";
        void sendOtlpLogs({
          apiKey: env.posthog?.apiKey,
          host: env.posthog?.host,
          records: [
            {
              message: "request",
              level,
              app: "api",
              environment: analyticsEnvironment,
              release: analyticsRelease,
              requestId: event.requestId,
              route: event.route,
              status: event.status,
              durationMs: event.durationMs,
            },
          ],
        });
      }
    : undefined,
  onException: analytics
    ? (event) => {
        void analytics.then((client) => {
          const error = new Error(event.errorName);
          error.name = event.errorName;
          client.exception(error, {
            route: event.route,
            status: event.status,
            source: "server",
          });
        });
      }
    : undefined,
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
      if (analytics) await (await analytics).shutdown();
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
