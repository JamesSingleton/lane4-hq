export const INVITE_REQUIRED_MESSAGE =
  "Lane4 is in private beta. You need an invitation to create an account.";

export const INVITE_REQUIRED_CODE = "INVITE_REQUIRED";

export function normalizeSignupEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isOpenInvite(
  invite: { status: string; expiresAt: Date } | null | undefined,
  now = new Date(),
): boolean {
  if (!invite) return false;
  if (invite.status !== "pending") return false;
  return invite.expiresAt.getTime() > now.getTime();
}

/** A new account is allowed when a beta invite or a team invite is still open. */
export function signupAllowed(input: {
  beta: { status: string; expiresAt: Date } | null;
  team: { status: string; expiresAt: Date } | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  return isOpenInvite(input.beta, now) || isOpenInvite(input.team, now);
}

export function parseOperatorEmails(
  raw: string | undefined,
): ReadonlySet<string> {
  if (!raw) return new Set();
  const emails = raw
    .split(",")
    .map((part) => normalizeSignupEmail(part))
    .filter((part) => part.length > 0);
  return new Set(emails);
}

export function isBetaOperator(
  email: string,
  operators: ReadonlySet<string>,
): boolean {
  return operators.has(normalizeSignupEmail(email));
}
