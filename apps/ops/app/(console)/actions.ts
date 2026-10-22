"use server";

import { createStaffMember } from "@lane4hq/auth/staff-account";
import { getStaffSession } from "@lane4hq/auth/staff-session";
import type { AuditContext } from "@lane4hq/db/audit";
import { writeAuditLog } from "@lane4hq/db/audit";
import {
  createBetaInvite,
  revokeBetaInvite,
} from "@lane4hq/db/queries/beta-invites";
import {
  findBetaAccessRequestById,
  reviewBetaAccessRequest,
} from "@lane4hq/db/queries/beta-requests";
import { createSupportHandoff } from "@lane4hq/db/queries/support-handoffs";
import {
  findUserForSupport,
  searchUsersForSupport,
} from "@lane4hq/db/queries/support-users";
import { getBaseUrl, sendBetaInvite } from "@lane4hq/emails";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { supportHandoffUrl } from "@/lib/handoff-url";

const emailSchema = z.string().trim().email("Enter a valid email address.");

async function requireStaff(
  denied: string,
): Promise<{ error: string } | { staffId: string; email: string }> {
  const session = await getStaffSession();
  const staffId = session?.user?.id;
  const email = session?.user?.email;
  if (!staffId || !email) return { error: denied };
  return { staffId, email };
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
  const base = (process.env.ADMIN_URL ?? getBaseUrl()).replace(/\/$/, "");
  return `${base}/sign-up?invite=${encodeURIComponent(token)}`;
}

export async function createBetaInviteAction(
  email: string,
): Promise<
  | { ok: true; inviteUrl: string; emailed: boolean }
  | { ok: false; error: string }
> {
  const actor = await requireStaff("You can't send beta invites");
  if ("error" in actor) return { ok: false, error: actor.error };
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
      invitedByStaffId: actor.staffId,
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
      actorStaffId: actor.staffId,
      action: "beta.invite.create",
      resourceType: "beta_invite",
      resourceId: invite.id,
      metadata: { email: invite.email },
      context: await auditContext(),
    });
    revalidatePath("/invites");
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
  const actor = await requireStaff("You can't send beta invites");
  if ("error" in actor) return { ok: false, error: actor.error };
  const trimmed = id.trim();
  if (!trimmed) return { ok: false, error: "Missing invite" };

  try {
    const revoked = await revokeBetaInvite(trimmed);
    if (!revoked)
      return { ok: false, error: "That invite is no longer pending" };
    await writeAuditLog({
      organizationId: null,
      actorStaffId: actor.staffId,
      action: "beta.invite.revoke",
      resourceType: "beta_invite",
      resourceId: revoked.id,
      metadata: { email: revoked.email },
      context: await auditContext(),
    });
    revalidatePath("/invites");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not revoke invite",
    };
  }
}

export async function reviewBetaAccessRequestAction(
  id: string,
  decision: "approved" | "denied",
): Promise<
  | { ok: true; inviteUrl?: string; emailed?: boolean }
  | { ok: false; error: string }
> {
  const actor = await requireStaff("You can't review access requests");
  if ("error" in actor) return { ok: false, error: actor.error };
  if (decision !== "approved" && decision !== "denied") {
    return { ok: false, error: "Choose approve or deny" };
  }
  const trimmed = id.trim();
  if (!trimmed) return { ok: false, error: "Missing request" };

  try {
    const request = await findBetaAccessRequestById(trimmed);
    if (request?.status !== "pending") {
      return { ok: false, error: "That request is no longer pending" };
    }

    let url: string | undefined;
    let emailed = false;
    if (decision === "approved") {
      const invite = await createBetaInvite({
        email: request.email,
        invitedByStaffId: actor.staffId,
      });
      url = inviteUrl(invite.token);
      emailed = true;
      try {
        await sendBetaInvite({ to: invite.email, inviteUrl: url });
      } catch (error) {
        emailed = false;
        console.error("Beta invite email failed", error);
      }
    }

    const reviewed = await reviewBetaAccessRequest({
      id: request.id,
      status: decision,
      reviewedByStaffId: actor.staffId,
    });
    if (!reviewed && decision === "denied") {
      return { ok: false, error: "That request is no longer pending" };
    }

    await writeAuditLog({
      organizationId: null,
      actorStaffId: actor.staffId,
      action:
        decision === "approved" ? "beta.request.approve" : "beta.request.deny",
      resourceType: "beta_access_request",
      resourceId: request.id,
      metadata: { email: request.email },
      context: await auditContext(),
    });
    revalidatePath("/requests");
    revalidatePath("/");
    return decision === "approved"
      ? { ok: true, inviteUrl: url, emailed }
      : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not review that request",
    };
  }
}

const staffSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

export async function createStaffAction(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const actor = await requireStaff("You can't add staff");
  if ("error" in actor) return { ok: false, error: actor.error };
  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the staff details.",
    };
  }
  try {
    const created = await createStaffMember(parsed.data);
    await writeAuditLog({
      organizationId: null,
      actorStaffId: actor.staffId,
      action: "staff.create",
      resourceType: "staff",
      resourceId: created.id,
      metadata: { email: created.email },
      context: await auditContext(),
    });
    revalidatePath("/staff");
    return { ok: true, email: created.email };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not create that staff account",
    };
  }
}

export async function searchUsersAction(query: string) {
  const actor = await requireStaff("You can't look up users");
  if ("error" in actor) return { ok: false as const, error: actor.error };
  const trimmed = query.trim();
  if (trimmed.length < 3 || trimmed.length > 200) {
    return { ok: false as const, error: "Enter between 3 and 200 characters." };
  }

  try {
    const rows = await searchUsersForSupport(trimmed);
    return {
      ok: true as const,
      users: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("Support user search failed", error);
    return { ok: false as const, error: "Could not search users" };
  }
}

export async function openCoachAction(
  userId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const actor = await requireStaff("You can't open coach accounts");
  if ("error" in actor) return { ok: false, error: actor.error };
  const target = await findUserForSupport(userId);
  if (!target) return { ok: false, error: "No user with that id." };

  try {
    const handoff = await createSupportHandoff({
      staffId: actor.staffId,
      targetUserId: target.id,
    });
    const url = supportHandoffUrl(
      process.env.ADMIN_URL ?? "http://localhost:3001",
      handoff.token,
    );
    if (!url) return { ok: false, error: "Could not open that account" };
    return { ok: true, url };
  } catch (error) {
    console.error("Support handoff failed", error);
    return { ok: false, error: "Could not open that account" };
  }
}
