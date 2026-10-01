import type { AppEnv } from "@api/rest/types";
import { getClientIp } from "@api/rest/utils/ip";
import { createMiddleware } from "hono/factory";

export const withClientIp = createMiddleware<AppEnv>(async (c, next) => {
  c.set("clientIp", getClientIp(c));
  await next();
});
