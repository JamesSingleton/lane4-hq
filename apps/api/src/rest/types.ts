import type { RateLimiter } from "@api/rest/middleware/rate-limit";
import type { DesktopReleases } from "@api/services/github";
import type { Logger } from "@api/utils/logger";
import type { RequestIdVariables } from "hono/request-id";

export type ApiUser = { id: string; name: string; email: string };

export type AppEnv = {
  Variables: RequestIdVariables & {
    /** Set by `withAuth` on protected routes. */
    user: ApiUser;
    /** Set by `withClientIp`; `"unknown"` when no address is available. */
    clientIp: string;
    rateLimiter: RateLimiter | undefined;
    desktopReleases: DesktopReleases | undefined;
    logger: Logger;
  };
};
