import type { AuditEvent } from "@lane4hq/db/audit";
import { isBetaOperator } from "./beta-access";

/** Support sessions expire after one hour. */
export const IMPERSONATION_SESSION_SECONDS = 60 * 60;

export const IMPERSONATION_FORBIDDEN_MESSAGE = "You cannot impersonate users.";
export const IMPERSONATION_NESTED_MESSAGE =
  "Stop the current impersonation first.";
export const IMPERSONATION_MISSING_USER_MESSAGE = "No user with that id.";
export const IMPERSONATION_SELF_MESSAGE =
  "You are already signed in as this user.";
export const IMPERSONATION_OPERATOR_MESSAGE =
  "Operators cannot impersonate other operators.";
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

/** Whether this operator may open a session as the target user. */
export function canStartImpersonation(input: {
  actorId: string;
  actorEmail: string;
  operators: ReadonlySet<string>;
  alreadyImpersonating: boolean;
  target: { id: string; email: string } | null;
}): ImpersonationDecision {
  if (!isBetaOperator(input.actorEmail, input.operators)) {
    return {
      ok: false,
      status: "FORBIDDEN",
      message: IMPERSONATION_FORBIDDEN_MESSAGE,
    };
  }
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
  if (input.target.id === input.actorId) {
    return {
      ok: false,
      status: "BAD_REQUEST",
      message: IMPERSONATION_SELF_MESSAGE,
    };
  }
  if (isBetaOperator(input.target.email, input.operators)) {
    return {
      ok: false,
      status: "FORBIDDEN",
      message: IMPERSONATION_OPERATOR_MESSAGE,
    };
  }
  return { ok: true };
}

/** The operator user id stored on a support session, if this session is one. */
export function impersonatorId(
  session: { impersonatedBy?: unknown } | null | undefined,
): string | null {
  const value = session?.impersonatedBy;
  return typeof value === "string" && value.length > 0 ? value : null;
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

export function impersonationAuditEvent(input: {
  action: "auth.impersonation.start" | "auth.impersonation.stop";
  actorUserId: string;
  targetUserId: string;
  targetEmail: string;
}): AuditEvent {
  return {
    organizationId: null,
    actorUserId: input.actorUserId,
    action: input.action,
    resourceType: "user",
    resourceId: input.targetUserId,
    metadata: { targetEmail: input.targetEmail },
  };
}
