import type { AuditContext, AuditEvent } from "@lane4hq/db/audit";

const ACTIONS: Record<string, string> = {
  "/device/approve": "auth.device.approve",
  "/device/deny": "auth.device.deny",
  "/revoke-session": "auth.session.revoke",
  "/revoke-sessions": "auth.sessions.revoke_all",
  "/revoke-other-sessions": "auth.sessions.revoke_others",
};

export function isAuditedAuthPath(path: string): boolean {
  return path in ACTIONS;
}

/**
 * The audit event for a successful Better Auth call, or null. Account events
 * belong to no team. Session tokens are secrets, so revocations are logged
 * against the user rather than the token.
 */
export function authAuditEvent(input: {
  path: string;
  userId: string | undefined;
  body: unknown;
}): AuditEvent | null {
  const action = ACTIONS[input.path];
  if (!action || !input.userId) return null;
  if (input.path.startsWith("/device/")) {
    const userCode = (input.body as { userCode?: unknown } | null)?.userCode;
    return {
      organizationId: null,
      actorUserId: input.userId,
      action,
      resourceType: "device_code",
      resourceId: typeof userCode === "string" ? userCode : "unknown",
    };
  }
  return {
    organizationId: null,
    actorUserId: input.userId,
    action,
    resourceType: "user",
    resourceId: input.userId,
  };
}

export function authAuditContext(headers: Headers | undefined): AuditContext {
  const ip =
    headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers?.get("x-real-ip")?.trim() ||
    null;
  return {
    source: "auth",
    ipAddress: ip,
    userAgent: headers?.get("user-agent") ?? null,
    requestId: headers?.get("x-request-id") ?? null,
  };
}
