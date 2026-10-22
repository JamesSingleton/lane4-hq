import { invitationIdFromCallback } from "@/lib/auth-callback";

export type SignupGate =
  | { status: "allowed"; email: string; source: "beta" | "team" }
  | { status: "denied"; reason: "missing" | "invalid" };

/**
 * Open the sign-up form only for a live beta token or a live team invitation.
 * A token that does not match, or an invitation id that does not match, is
 * invalid rather than a generic closed page.
 */
export function resolveSignupGate(input: {
  inviteToken: string | null;
  betaInvite: { email: string } | null;
  callbackUrl: string;
  teamInvite: { email: string } | null;
}): SignupGate {
  const token = input.inviteToken?.trim() ?? "";
  if (token) {
    if (!input.betaInvite) return { status: "denied", reason: "invalid" };
    return {
      status: "allowed",
      email: input.betaInvite.email,
      source: "beta",
    };
  }

  const invitationId = invitationIdFromCallback(input.callbackUrl);
  if (invitationId) {
    if (!input.teamInvite) return { status: "denied", reason: "invalid" };
    return {
      status: "allowed",
      email: input.teamInvite.email,
      source: "team",
    };
  }

  return { status: "denied", reason: "missing" };
}
