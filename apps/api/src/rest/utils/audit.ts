import type { AppEnv } from "@api/rest/types";
import type { AuditContext } from "@lane4hq/db/audit";
import type { Context } from "hono";

export function auditContext(c: Context<AppEnv>): AuditContext {
  const ip = c.get("clientIp");
  return {
    source: "api",
    ipAddress: !ip || ip === "unknown" ? null : ip,
    userAgent: c.req.header("user-agent") ?? null,
    requestId: c.get("requestId"),
  };
}
