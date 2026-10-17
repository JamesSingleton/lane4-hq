import type { AppEnv } from "@api/rest/types";
import { ApiError } from "@api/utils/errors";
import { auth } from "@lane4hq/auth/server";
import { createMiddleware } from "hono/factory";

/**
 * Accepts a Better Auth session as `Authorization: Bearer <token>` (desktop,
 * mobile) or as the session cookie (browsers on a Lane4 origin).
 */
export const withAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    throw new ApiError(401, "unauthorized", "Sign in to use this endpoint.");
  }
  c.set("user", {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  });
  await next();
});
