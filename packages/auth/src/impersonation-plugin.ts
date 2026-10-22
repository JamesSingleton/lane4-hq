import { writeAuditLog } from "@lane4hq/db/audit";
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
import { parseOperatorEmails } from "./beta-access";
import {
  canStartImpersonation,
  IMPERSONATION_LOCKED_MESSAGE,
  IMPERSONATION_MISSING_USER_MESSAGE,
  IMPERSONATION_SESSION_SECONDS,
  impersonationAuditEvent,
  impersonatorId,
  isBlockedWhileImpersonating,
  packImpersonatorCookie,
  unpackImpersonatorCookie,
} from "./impersonation";
import { keys } from "./keys";

const IMPERSONATOR_COOKIE = "impersonator_session";

const impersonateBodySchema = z.object({
  userId: z.string().trim().min(1).max(200),
});

type SessionRecord = {
  impersonatedBy?: unknown;
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
            if (impersonatorId(asSession(session?.session))) {
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
            const actorUserId = impersonatorId(asSession(session?.session));
            const target = asUser(session?.user);
            if (actorUserId && target) {
              await recordAudit(
                ctx.headers,
                impersonationAuditEvent({
                  action: "auth.impersonation.stop",
                  actorUserId,
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
              response.filter((session) => !impersonatorId(asSession(session))),
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
        async (ctx) => {
          const current = await getAuthoritativeSessionFromCtx(ctx);
          const actor = asUser(current?.user);
          if (!current || !actor) {
            throw new APIError("UNAUTHORIZED", {
              message: "You must be signed in",
            });
          }
          const operators = parseOperatorEmails(keys().BETA_OPERATOR_EMAILS);
          const targetRow = await ctx.context.internalAdapter.findUserById(
            ctx.body.userId,
          );
          const target = asUser(targetRow);
          const decision = canStartImpersonation({
            actorId: actor.id,
            actorEmail: actor.email,
            operators,
            alreadyImpersonating:
              impersonatorId(asSession(current.session)) !== null,
            target: target ? { id: target.id, email: target.email } : null,
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
            { impersonatedBy: actor.id, expiresAt },
            true,
          );
          if (!created) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Could not open that account",
            });
          }
          const operatorToken = asSession(current.session)?.token;
          if (!operatorToken) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Could not open that account",
            });
          }
          const remember =
            (await ctx.getSignedCookie(
              ctx.context.authCookies.dontRememberToken.name,
              ctx.context.secret,
            )) || "";
          deleteSessionCookie(ctx);
          const impersonatorCookie =
            ctx.context.createAuthCookie(IMPERSONATOR_COOKIE);
          await ctx.setSignedCookie(
            impersonatorCookie.name,
            packImpersonatorCookie(operatorToken, remember),
            ctx.context.secret,
            ctx.context.authCookies.sessionToken.attributes,
          );
          await setSessionCookie(
            ctx,
            { session: created, user: targetRow },
            true,
          );
          await recordAudit(
            ctx.headers,
            impersonationAuditEvent({
              action: "auth.impersonation.start",
              actorUserId: actor.id,
              targetUserId: target.id,
              targetEmail: target.email,
            }),
          );
          return ctx.json({
            user: { id: target.id, email: target.email, name: target.name },
          });
        },
      ),
      stopImpersonating: createAuthEndpoint(
        "/stop-impersonating",
        { method: "POST", requireHeaders: true },
        async (ctx) => {
          const current = await getAuthoritativeSessionFromCtx(ctx);
          const target = asUser(current?.user);
          const actorUserId = impersonatorId(asSession(current?.session));
          if (!current || !target || !actorUserId) {
            throw new APIError("BAD_REQUEST", {
              message: "You are not impersonating anyone",
            });
          }
          const operator = asUser(
            await ctx.context.internalAdapter.findUserById(actorUserId),
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
