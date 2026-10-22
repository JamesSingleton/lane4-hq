"use server";

import { isBetaOperator, parseOperatorEmails } from "@lane4hq/auth/beta-access";
import { keys } from "@lane4hq/auth/keys";
import { getSession } from "@lane4hq/auth/session";
import type { AuditContext } from "@lane4hq/db/audit";
import { writeAuditLog } from "@lane4hq/db/audit";
import {
  createBetaInvite,
  revokeBetaInvite,
} from "@lane4hq/db/queries/beta-invites";
import { getBaseUrl, sendBetaInvite } from "@lane4hq/emails";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

const emailSchema = z.string().trim().email("Enter a valid email address.");

async function requireOperator(): Promise<
  { userId: string; email: string } | { error: string }
> {
  const session = await getSession();
  const email = session?.user?.email;
  if (!session?.user?.id || !email) {
    return { error: "You must be signed in" };
  }
  const operators = parseOperatorEmails(keys().BETA_OPERATOR_EMAILS);
  if (!isBetaOperator(email, operators)) {
    return { error: "You can't send beta invites" };
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
  const operator = await requireOperator();
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
  const operator = await requireOperator();
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
