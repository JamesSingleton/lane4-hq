import type { AuditContext } from "@lane4hq/db/audit";
import { headers } from "next/headers";

/** Who made this admin request and from where, for `writeAuditLog`. */
export async function adminAuditContext(): Promise<AuditContext> {
  const h = await headers();
  return {
    source: "admin",
    // Vercel sets X-Real-IP; the first X-Forwarded-For hop is the fallback.
    ipAddress:
      h.get("x-real-ip")?.trim() ||
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-vercel-id"),
  };
}
