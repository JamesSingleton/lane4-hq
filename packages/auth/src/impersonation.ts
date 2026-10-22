import type { AuditEvent } from "@lane4hq/db/audit";

/** Support sessions expire after one hour. */
export const IMPERSONATION_SESSION_SECONDS = 60 * 60;

export const IMPERSONATION_FORBIDDEN_MESSAGE = "You cannot impersonate users.";
export const IMPERSONATION_NESTED_MESSAGE =
  "Stop the current impersonation first.";
export const IMPERSONATION_MISSING_USER_MESSAGE = "No user with that id.";
export const IMPERSONATION_LOCKED_MESSAGE =
  "Stop impersonating before changing account security, sessions, devices, or billing.";

const BLOCKED_WHILE_IMPERSONATING = new Set([
  "/change-password",
  "/set-password",
  "/change-email",
  "/delete-user",
  "/delete-user/callback",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/device/approve",
  "/device/deny",
  "/checkout",
  "/customer/portal",
]);

export type ImpersonationDecision =
  | { ok: true }
  | {
      ok: false;
      status: "FORBIDDEN" | "BAD_REQUEST" | "NOT_FOUND";
      message: string;
    };

/** Whether a staff account may open a session as this coach. */
export function canStartStaffView(input: {
  alreadyImpersonating: boolean;
  target: { id: string } | null;
}): ImpersonationDecision {
  if (input.alreadyImpersonating) {
    return {
      ok: false,
      status: "BAD_REQUEST",
      message: IMPERSONATION_NESTED_MESSAGE,
    };
  }
  if (!input.target) {
    return {
      ok: false,
      status: "NOT_FOUND",
      message: IMPERSONATION_MISSING_USER_MESSAGE,
    };
  }
  return { ok: true };
}

function sessionActorId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Who opened a support session: a Lane4 staff account, or a legacy coach user. */
export function supportViewer(
  session:
    | { impersonatedBy?: unknown; impersonatedByStaffId?: unknown }
    | null
    | undefined,
): { kind: "staff" | "user"; id: string } | null {
  const staffId = sessionActorId(session?.impersonatedByStaffId);
  if (staffId) return { kind: "staff", id: staffId };
  const userId = sessionActorId(session?.impersonatedBy);
  if (userId) return { kind: "user", id: userId };
  return null;
}

/** The coach user id stored on a legacy support session. */
export function impersonatorId(
  session: { impersonatedBy?: unknown } | null | undefined,
): string | null {
  const viewer = supportViewer(session);
  return viewer?.kind === "user" ? viewer.id : null;
}

/**
 * Account security, device approval, and billing stay on the operator's own
 * session. Roster and meet screens stay available so a report can be reproduced.
 */
export function isBlockedWhileImpersonating(path: string): boolean {
  if (BLOCKED_WHILE_IMPERSONATING.has(path)) return true;
  return path.startsWith("/two-factor/");
}

const COOKIE_SEPARATOR = "\u001f";

/** Packs the operator session token and remember-me flag. The value is signed into an httpOnly cookie. */
export function packImpersonatorCookie(
  sessionToken: string,
  remember: string,
): string {
  return `${sessionToken}${COOKIE_SEPARATOR}${remember}`;
}

export function unpackImpersonatorCookie(
  value: string,
): { sessionToken: string; remember: string } | null {
  const index = value.indexOf(COOKIE_SEPARATOR);
  if (index <= 0) return null;
  return {
    sessionToken: value.slice(0, index),
    remember: value.slice(index + 1),
  };
}

export function impersonationAuditEvent(
  input: {
    action: "auth.impersonation.start" | "auth.impersonation.stop";
    targetUserId: string;
    targetEmail: string;
  } & (
    | { actorUserId: string; actorStaffId?: never }
    | { actorStaffId: string; actorUserId?: never }
  ),
): AuditEvent {
  const base = {
    organizationId: null,
    action: input.action,
    resourceType: "user",
    resourceId: input.targetUserId,
    metadata: { targetEmail: input.targetEmail },
  };
  const actorStaffId = input.actorStaffId;
  if (typeof actorStaffId === "string") {
    return { ...base, actorStaffId };
  }
  return { ...base, actorUserId: input.actorUserId as string };
}
