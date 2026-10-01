import type { RateLimiter } from "@api/rest/middleware/rate-limit";
import { routers } from "@api/rest/routers";
import type { AppEnv } from "@api/rest/types";
import type { DesktopReleases } from "@api/services/github";
import { ApiError, errorBody } from "@api/utils/errors";
import { type ReadinessCheck, runReadiness } from "@api/utils/health";
import { jsonLogger, type Logger } from "@api/utils/logger";
import { validationHook } from "@api/utils/validation";
import { OpenAPIHono } from "@hono/zod-openapi";
import { auth } from "@lane4hq/auth/server";
import { AuthError } from "@lane4hq/db/authz";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";

export const OPENAPI_INFO = {
  openapi: "3.1.0",
  info: {
    title: "Lane4 API",
    version: "1.0.0",
    description:
      "For Lane4's desktop meet manager, mobile apps, and live results. Routes under `/v1` keep their shape; breaking changes get a new version.",
    license: {
      name: "AGPL-3.0-only",
      url: "https://www.gnu.org/licenses/agpl-3.0.html",
    },
  },
  tags: [
    { name: "Account", description: "The signed-in user" },
    { name: "Meets", description: "A team's meets, for the deck machine" },
    { name: "Results", description: "Published results from hosted meets" },
    { name: "Desktop", description: "Desktop app updates" },
  ],
};

export type AppOptions = {
  /** Browser origins allowed to call the API (native apps send no Origin). */
  allowedOrigins: string[];
  /** Defaults to JSON lines on stdout. */
  logger?: Logger;
  /** Omit to serve without rate limits (local development). */
  rateLimiter?: RateLimiter;
  /** Omit and the desktop updater hears "no update". */
  desktopReleases?: DesktopReleases;
  /** Dependencies `/health/ready` probes, e.g. `{ database: pingDatabase }`. */
  readiness?: Record<string, ReadinessCheck>;
};

/** Probes hit these constantly; logging them buries real traffic. */
const QUIET_PATHS = new Set(["/health", "/health/ready"]);

export function createApp(options: AppOptions) {
  const logger = options.logger ?? jsonLogger();
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });

  app.use(requestId());
  app.use(async (c, next) => {
    c.set("rateLimiter", options.rateLimiter);
    c.set("desktopReleases", options.desktopReleases);
    c.set("logger", logger);
    const started = performance.now();
    await next();
    if (QUIET_PATHS.has(c.req.path)) return;
    logger.info("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - started),
      requestId: c.get("requestId"),
      userId: (c.get("user") as { id: string } | undefined)?.id,
    });
  });
  app.use(secureHeaders({ crossOriginResourcePolicy: "cross-origin" }));
  app.use(
    "*",
    cors({
      origin: options.allowedOrigins,
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
      exposeHeaders: [
        "set-auth-token",
        "RateLimit-Limit",
        "RateLimit-Remaining",
        "RateLimit-Reset",
        "Retry-After",
        "X-Request-Id",
      ],
      maxAge: 86400,
    }),
  );

  // Sign-in for native apps: device codes, bearer tokens, and later Expo.
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.get("/", (c) => c.json({ name: "Lane4 API", docs: "/docs" }));
  // Liveness: the process is up. Railway's deploy healthcheck uses this, so
  // a database blip doesn't fail a deploy or restart a healthy server.
  app.get("/health", (c) => c.json({ status: "ok" }));
  // Readiness: the process can do real work.
  app.get("/health/ready", async (c) => {
    const { ready, checks } = await runReadiness(
      options.readiness ?? {},
      logger,
    );
    return c.json(
      { status: ready ? "ok" : "unavailable", checks },
      ready ? 200 : 503,
    );
  });

  app.route("/v1", routers);

  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description:
      "A Lane4 session token. Desktop apps get one by device sign-in (`/api/auth/device/code`).",
  });
  app.doc31("/openapi.json", OPENAPI_INFO);
  app.get("/docs", Scalar({ url: "/openapi.json", pageTitle: "Lane4 API" }));

  app.notFound((c) => c.json(errorBody("not_found", "No such endpoint."), 404));
  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json(errorBody(error.code, error.message), error.status);
    }
    if (error instanceof AuthError) {
      return error.status === 403
        ? c.json(errorBody("forbidden", error.message), 403)
        : c.json(errorBody("unauthorized", error.message), 401);
    }
    logger.error("unhandled error", {
      error,
      method: c.req.method,
      path: c.req.path,
      requestId: c.get("requestId"),
    });
    return c.json(errorBody("internal", "Something went wrong."), 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
