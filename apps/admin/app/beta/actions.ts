"use server";

import { isBetaOperator, parseOperatorEmails } from "@lane4hq/auth/beta-access";
import { impersonatorId } from "@lane4hq/auth/impersonation";
import { keys } from "@lane4hq/auth/keys";
import { getSession } from "@lane4hq/auth/session";
import type { AuditContext } from "@lane4hq/db/audit";
import { writeAuditLog } from "@lane4hq/db/audit";
import {
  createBetaInvite,
  revokeBetaInvite,
} from "@lane4hq/db/queries/beta-invites";
import { searchUsersForSupport } from "@lane4hq/db/queries/support-users";
import { getBaseUrl, sendBetaInvite } from "@lane4hq/emails";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

const emailSchema = z.string().trim().email("Enter a valid email address.");

async function requireOperator(
  denied: string,
): Promise<{ userId: string; email: string } | { error: string }> {
  const session = await getSession();
  const email = session?.user?.email;
  if (!session?.user?.id || !email) {
    return { error: "You must be signed in" };
  }
  if (impersonatorId(session.session)) {
    return { error: "Stop viewing this account first" };
  }
  const operators = parseOperatorEmails(keys().BETA_OPERATOR_EMAILS);
  if (!isBetaOperator(email, operators)) {
    return { error: denied };
  }
  return { userId: session.user.id, email };
}

async function auditContext(): Promise<AuditContext> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  return {
    source: "admin",
    ipAddress: forwarded?.split(",")[0]?.trim() || null,
    userAgent: headerList.get("user-agent"),
    requestId: headerList.get("x-request-id"),
  };
}

function inviteUrl(token: string): string {
  const base = getBaseUrl().replace(/\/$/, "");
  return `${base}/sign-up?invite=${encodeURIComponent(token)}`;
}

export async function createBetaInviteAction(
  email: string,
): Promise<
  | { ok: true; inviteUrl: string; emailed: boolean }
  | { ok: false; error: string }
> {
  const operator = await requireOperator("You can't send beta invites");
  if ("error" in operator) return { ok: false, error: operator.error };

  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Enter a valid email address.",
    };
  }

  try {
    const invite = await createBetaInvite({
      email: parsed.data,
      invitedByUserId: operator.userId,
    });
    const url = inviteUrl(invite.token);
    let emailed = true;
    try {
      await sendBetaInvite({ to: invite.email, inviteUrl: url });
    } catch (error) {
      emailed = false;
      console.error("Beta invite email failed", error);
    }
    await writeAuditLog({
      organizationId: null,
      actorUserId: operator.userId,
      action: "beta.invite.create",
      resourceType: "beta_invite",
      resourceId: invite.id,
      metadata: { email: invite.email },
      context: await auditContext(),
    });
    revalidatePath("/beta");
    return { ok: true, inviteUrl: url, emailed };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not create invite",
    };
  }
}

export async function revokeBetaInviteAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const operator = await requireOperator("You can't send beta invites");
  if ("error" in operator) return { ok: false, error: operator.error };
  const trimmed = id.trim();
  if (!trimmed) return { ok: false, error: "Missing invite" };

  try {
    const revoked = await revokeBetaInvite(trimmed);
    if (!revoked)
      return { ok: false, error: "That invite is no longer pending" };
    await writeAuditLog({
      organizationId: null,
      actorUserId: operator.userId,
      action: "beta.invite.revoke",
      resourceType: "beta_invite",
      resourceId: revoked.id,
      metadata: { email: revoked.email },
      context: await auditContext(),
    });
    revalidatePath("/beta");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not revoke invite",
    };
  }
}

export async function searchUsersAction(query: string): Promise<
  | {
      ok: true;
      users: Array<{
        id: string;
        name: string;
        email: string;
        createdAt: string;
        canImpersonate: boolean;
      }>;
    }
  | { ok: false; error: string }
> {
  const operator = await requireOperator("You can't look up users");
  if ("error" in operator) return { ok: false, error: operator.error };
  const trimmed = query.trim();
  if (trimmed.length < 3 || trimmed.length > 200) {
    return { ok: false, error: "Enter between 3 and 200 characters." };
  }

  try {
    const operators = parseOperatorEmails(keys().BETA_OPERATOR_EMAILS);
    const rows = await searchUsersForSupport(trimmed);
    return {
      ok: true,
      users: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        createdAt: row.createdAt.toISOString(),
        canImpersonate:
          row.id !== operator.userId && !isBetaOperator(row.email, operators),
      })),
    };
  } catch (error) {
    console.error("Support user search failed", error);
    return { ok: false, error: "Could not search users" };
  }
}
