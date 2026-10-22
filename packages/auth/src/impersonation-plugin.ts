import { writeAuditLog } from "@lane4hq/db/audit";
import { findStaffById } from "@lane4hq/db/queries/staff";
import { consumeSupportHandoff } from "@lane4hq/db/queries/support-handoffs";
import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx,
  getSessionFromCtx,
} from "better-auth/api";
import {
  deleteSessionCookie,
  expireCookie,
  setSessionCookie,
} from "better-auth/cookies";
import { z } from "zod";
import { authAuditContext } from "./audit-events";
import {
  canStartStaffView,
  IMPERSONATION_FORBIDDEN_MESSAGE,
  IMPERSONATION_LOCKED_MESSAGE,
  IMPERSONATION_MISSING_USER_MESSAGE,
  IMPERSONATION_SESSION_SECONDS,
  impersonationAuditEvent,
  isBlockedWhileImpersonating,
  supportViewer,
  unpackImpersonatorCookie,
} from "./impersonation";

const IMPERSONATOR_COOKIE = "impersonator_session";

const impersonateBodySchema = z.object({
  userId: z.string().trim().min(1).max(200),
});

const handoffBodySchema = z.object({
  token: z.string().trim().min(20).max(200),
});

type SessionRecord = {
  impersonatedBy?: unknown;
  impersonatedByStaffId?: unknown;
  token?: string;
  userId?: string;
};
type UserRecord = { id: string; email: string; name: string };

function asSession(value: unknown): SessionRecord | null {
  if (!value || typeof value !== "object") return null;
  return value as SessionRecord;
}

function asUser(value: unknown): UserRecord | null {
  if (!value || typeof value !== "object") return null;
  const user = value as { id?: unknown; email?: unknown; name?: unknown };
  if (typeof user.id !== "string" || typeof user.email !== "string")
    return null;
  return {
    id: user.id,
    email: user.email,
    name: typeof user.name === "string" ? user.name : user.email,
  };
}

async function endpointJson(ctx: {
  context: { returned?: unknown };
}): Promise<unknown> {
  const returned = ctx.context.returned;
  if (!returned) return null;
  if (returned instanceof Response) {
    if (returned.status !== 200) return null;
    return returned.clone().json();
  }
  return returned;
}

async function recordAudit(
  headers: Headers | undefined,
  event: ReturnType<typeof impersonationAuditEvent>,
) {
  try {
    await writeAuditLog({ ...event, context: authAuditContext(headers) });
  } catch (error) {
    console.error("Audit log write failed", error);
  }
}

/**
 * Operator-only "view as user" sessions. This is intentionally smaller than
 * Better Auth's admin plugin: ban, delete, set-role, and set-password are not registered.
 */
export function impersonation() {
  const plugin = {
    id: "impersonation",
    schema: {
      session: {
        fields: {
          impersonatedBy: {
            type: "string" as const,
            required: false,
            input: false,
          },
          impersonatedByStaffId: {
            type: "string" as const,
            required: false,
            input: false,
          },
        },
      },
    },
    hooks: {
      before: [
        {
          matcher(context: { path?: string }) {
            return !!context.path && isBlockedWhileImpersonating(context.path);
          },
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getAuthoritativeSessionFromCtx(ctx);
            if (supportViewer(asSession(session?.session))) {
              throw new APIError("FORBIDDEN", {
                message: IMPERSONATION_LOCKED_MESSAGE,
              });
            }
          }),
        },
        {
          matcher(context: { path?: string }) {
            return context.path === "/sign-out";
          },
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx).catch(() => null);
            const viewer = supportViewer(asSession(session?.session));
            const target = asUser(session?.user);
            if (viewer && target) {
              await recordAudit(
                ctx.headers,
                impersonationAuditEvent({
                  action: "auth.impersonation.stop",
                  ...(viewer.kind === "staff"
                    ? { actorStaffId: viewer.id }
                    : { actorUserId: viewer.id }),
                  targetUserId: target.id,
                  targetEmail: target.email,
                }),
              );
            }
            expireCookie(
              ctx,
              ctx.context.createAuthCookie(IMPERSONATOR_COOKIE),
            );
          }),
        },
      ],
      after: [
        {
          matcher(context: { path?: string }) {
            return context.path === "/list-sessions";
          },
          handler: createAuthMiddleware(async (ctx) => {
            const response = await endpointJson(ctx);
            if (!Array.isArray(response)) return;
            return ctx.json(
              response.filter((session) => !supportViewer(asSession(session))),
            );
          }),
        },
      ],
    },
    endpoints: {
      impersonateUser: createAuthEndpoint(
        "/impersonate-user",
        {
          method: "POST",
          body: impersonateBodySchema,
          requireHeaders: true,
        },
        async () => {
          throw new APIError("FORBIDDEN", {
            message: "Open this coach from Lane4 Ops.",
          });
        },
      ),
      impersonateHandoff: createAuthEndpoint(
        "/impersonate-handoff",
        {
          method: "POST",
          body: handoffBodySchema,
          requireHeaders: true,
        },
        async (ctx) => {
          const handoff = await consumeSupportHandoff(ctx.body.token);
          if (!handoff) {
            throw new APIError("BAD_REQUEST", {
              message: "This view link has expired",
            });
          }
          const member = await findStaffById(handoff.staffId);
          const targetRow = await ctx.context.internalAdapter.findUserById(
            handoff.targetUserId,
          );
          const target = asUser(targetRow);
          if (!member) {
            throw new APIError("FORBIDDEN", {
              message: IMPERSONATION_FORBIDDEN_MESSAGE,
            });
          }
          const decision = canStartStaffView({
            alreadyImpersonating: false,
            target: target ? { id: target.id } : null,
          });
          if (!decision.ok) {
            throw new APIError(decision.status, { message: decision.message });
          }
          if (!target || !targetRow) {
            throw new APIError("NOT_FOUND", {
              message: IMPERSONATION_MISSING_USER_MESSAGE,
            });
          }
          const expiresAt = new Date(
            Date.now() + IMPERSONATION_SESSION_SECONDS * 1000,
          );
          const created = await ctx.context.internalAdapter.createSession(
            target.id,
            true,
            { impersonatedByStaffId: member.id, expiresAt },
            true,
          );
          if (!created) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Could not open that account",
            });
          }
          deleteSessionCookie(ctx);
          await setSessionCookie(
            ctx,
            { session: created, user: targetRow },
            true,
          );
          await recordAudit(
            ctx.headers,
            impersonationAuditEvent({
              action: "auth.impersonation.start",
              actorStaffId: member.id,
              targetUserId: target.id,
              targetEmail: target.email,
            }),
          );
          return ctx.json({ ok: true });
        },
      ),
      stopImpersonating: createAuthEndpoint(
        "/stop-impersonating",
        { method: "POST", requireHeaders: true },
        async (ctx) => {
          const current = await getAuthoritativeSessionFromCtx(ctx);
          const target = asUser(current?.user);
          const viewer = supportViewer(asSession(current?.session));
          if (!current || !target || !viewer) {
            throw new APIError("BAD_REQUEST", {
              message: "You are not impersonating anyone",
            });
          }
          if (viewer.kind === "staff") {
            const impersonationToken = asSession(current.session)?.token;
            if (impersonationToken) {
              await ctx.context.internalAdapter.deleteSession(
                impersonationToken,
              );
            }
            deleteSessionCookie(ctx);
            expireCookie(
              ctx,
              ctx.context.createAuthCookie(IMPERSONATOR_COOKIE),
            );
            await recordAudit(
              ctx.headers,
              impersonationAuditEvent({
                action: "auth.impersonation.stop",
                actorStaffId: viewer.id,
                targetUserId: target.id,
                targetEmail: target.email,
              }),
            );
            return ctx.json({ ok: true });
          }
          const operator = asUser(
            await ctx.context.internalAdapter.findUserById(viewer.id),
          );
          if (!operator) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Could not restore your session. Sign in again.",
            });
          }
          const impersonatorCookie =
            ctx.context.createAuthCookie(IMPERSONATOR_COOKIE);
          const packed = await ctx.getSignedCookie(
            impersonatorCookie.name,
            ctx.context.secret,
          );
          const unpacked = packed ? unpackImpersonatorCookie(packed) : null;
          if (!unpacked) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Could not restore your session. Sign in again.",
            });
          }
          const operatorSession = await ctx.context.internalAdapter.findSession(
            unpacked.sessionToken,
          );
          const operatorSessionUserId = asSession(
            operatorSession?.session,
          )?.userId;
          if (!operatorSession || operatorSessionUserId !== operator.id) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Could not restore your session. Sign in again.",
            });
          }
          const impersonationToken = asSession(current.session)?.token;
          if (impersonationToken) {
            await ctx.context.internalAdapter.deleteSession(impersonationToken);
          }
          await setSessionCookie(
            ctx,
            operatorSession,
            unpacked.remember.length > 0,
          );
          expireCookie(ctx, impersonatorCookie);
          await recordAudit(
            ctx.headers,
            impersonationAuditEvent({
              action: "auth.impersonation.stop",
              actorUserId: operator.id,
              targetUserId: target.id,
              targetEmail: target.email,
            }),
          );
          return ctx.json({ ok: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
  return plugin;
}
