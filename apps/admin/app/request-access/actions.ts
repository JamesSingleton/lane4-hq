"use server";

import {
  findOpenBetaInviteByEmail,
  findOpenTeamInviteByEmail,
} from "@lane4hq/db/queries/beta-invites";
import {
  createBetaAccessRequest,
  findAccountByEmail,
} from "@lane4hq/db/queries/beta-requests";
import { listStaffEmails } from "@lane4hq/db/queries/staff";
import { sendBetaAccessRequest } from "@lane4hq/emails";
import { parseAccessRequest } from "@/lib/access-request";

const RECEIVED =
  "Request received. We'll email you at that address if you're approved.";

export async function submitAccessRequestAction(input: {
  name: string;
  email: string;
  team: string;
  reason: string;
  website?: string;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const parsed = parseAccessRequest(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (parsed.honeypot) return { ok: true, message: RECEIVED };

  try {
    const account = await findAccountByEmail(parsed.value.email);
    if (account) {
      return {
        ok: false,
        error: "An account with this email already exists. Sign in instead.",
      };
    }

    const beta = await findOpenBetaInviteByEmail(parsed.value.email);
    if (beta) {
      return {
        ok: false,
        error:
          "You already have an invitation. Check your email for the sign-up link.",
      };
    }

    const teamInvite = await findOpenTeamInviteByEmail(parsed.value.email);
    if (teamInvite) {
      return {
        ok: false,
        error:
          "Your team already invited you. Open the link in that email to create your account.",
      };
    }

    const created = await createBetaAccessRequest(parsed.value);
    if (created.outcome === "pending") {
      return {
        ok: true,
        message:
          "We already have a request from this email. We'll reply when it's reviewed.",
      };
    }

    const staffEmails = await listStaffEmails();
    if (staffEmails.length === 0) {
      console.error(
        "No staff accounts; access request saved without a notification",
      );
    } else {
      try {
        const opsBase = (
          process.env.OPS_URL ?? "http://localhost:3005"
        ).replace(/\/$/, "");
        const reviewUrl = `${opsBase}/requests`;
        await sendBetaAccessRequest({
          to: staffEmails,
          name: parsed.value.name,
          email: created.email,
          team: parsed.value.team,
          reason: parsed.value.reason,
          reviewUrl,
        });
      } catch (error) {
        console.error("Beta access request email failed", error);
      }
    }

    return { ok: true, message: RECEIVED };
  } catch (error) {
    console.error("Beta access request failed", error);
    return {
      ok: false,
      error: "Could not save that request. Try again in a moment.",
    };
  }
}
