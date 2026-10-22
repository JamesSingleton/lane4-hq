export { getBaseUrl, getEmailFrom, getResendClient } from "./client";

import { getBaseUrl } from "./client";
import { sendEmail } from "./send";

export type { EmailProps, EmailType, SendEmailOptions } from "./send";
export { sendEmail } from "./send";

export async function sendVerifyEmail({
  user,
  url,
}: {
  user: { email: string; name: string };
  url: string;
}) {
  await sendEmail({
    type: "verify-email",
    to: user.email,
    props: { name: user.name, url },
  });
}

export async function sendResetPassword({
  user,
  url,
}: {
  user: { email: string; name: string };
  url: string;
}) {
  await sendEmail({
    type: "reset-password",
    to: user.email,
    props: { name: user.name, url },
  });
}

export async function sendCoachWelcome({
  to,
  props,
}: {
  to: string;
  props: { name: string };
}) {
  await sendEmail({
    type: "coach-welcome",
    to,
    props: { name: props.name, dashboardUrl: `${getBaseUrl()}/onboarding` },
  });
}

export async function sendTeamWelcome({
  to,
  props,
}: {
  to: string;
  props: { teamName: string; teamId: string; name?: string };
}) {
  await sendEmail({
    type: "team-welcome",
    to,
    props: {
      name: props.name ?? "Coach",
      teamName: props.teamName,
      teamId: props.teamId,
      baseUrl: getBaseUrl(),
    },
  });
}

export async function sendBetaInvite({
  to,
  inviteUrl,
}: {
  to: string;
  inviteUrl: string;
}) {
  await sendEmail({
    type: "beta-invite",
    to,
    props: { inviteUrl },
  });
}

export async function sendBetaAccessRequest({
  to,
  name,
  email,
  team,
  reason,
  reviewUrl,
}: {
  to: string | string[];
  name: string;
  email: string;
  team: string;
  reason: string;
  reviewUrl: string;
}) {
  await sendEmail({
    type: "beta-access-request",
    to,
    props: { name, email, team, reason, reviewUrl },
  });
}

export async function sendCoachInvitation(data: {
  email: string;
  organization: { name: string };
  inviter: { user: { name: string } };
  invitation: { id: string };
  role?: string;
}) {
  const inviteUrl = `${getBaseUrl()}/accept-invite?id=${data.invitation.id}`;
  await sendEmail({
    type: "coach-invitation",
    to: data.email,
    props: {
      inviterName: data.inviter.user.name,
      teamName: data.organization.name,
      inviteUrl,
      role: data.role ?? "coach",
    },
  });
}

export async function sendInvitationAccepted(
  to: string,
  inviteeName: string,
  teamName: string,
) {
  await sendEmail({
    type: "invitation-accepted",
    to,
    props: { inviteeName, teamName },
  });
}

export async function sendRoleChanged(
  to: string,
  name: string,
  teamName: string,
  newRole: string,
) {
  await sendEmail({
    type: "role-changed",
    to,
    props: { name, teamName, newRole },
  });
}

export async function sendRemovedFromTeam(
  to: string,
  name: string,
  teamName: string,
) {
  await sendEmail({
    type: "removed-from-team",
    to,
    props: { name, teamName },
  });
}

export async function sendMemberJoined(
  to: string,
  memberName: string,
  teamName: string,
) {
  await sendEmail({
    type: "member-joined",
    to,
    props: { memberName, teamName },
  });
}

export async function sendPasswordChanged(to: string, name: string) {
  await sendEmail({
    type: "password-changed",
    to,
    props: { name },
  });
}

export async function sendTwoFactorOtp({
  to,
  name,
  otp,
}: {
  to: string;
  name: string;
  otp: string;
}) {
  await sendEmail({
    type: "two-factor-otp",
    to,
    props: { name, otp },
  });
}

export async function sendSubscriptionConfirmed(
  to: string,
  props: { name: string; teamName: string; plan: string; teamId: string },
) {
  await sendEmail({
    type: "subscription-confirmed",
    to,
    props: {
      ...props,
      billingUrl: `${getBaseUrl()}/team/${props.teamId}/settings/billing`,
    },
  });
}

export async function sendPaymentFailed(
  to: string,
  props: { name: string; teamName: string; teamId: string },
) {
  await sendEmail({
    type: "payment-failed",
    to,
    props: {
      name: props.name,
      teamName: props.teamName,
      billingUrl: `${getBaseUrl()}/team/${props.teamId}/settings/billing`,
    },
  });
}

export async function sendSubscriptionRenewed(
  to: string,
  props: { name: string; teamName: string; plan: string },
) {
  await sendEmail({
    type: "subscription-renewed",
    to,
    props,
  });
}

export async function sendPlanDowngraded(
  to: string,
  props: { name: string; teamName: string },
) {
  await sendEmail({
    type: "plan-downgraded",
    to,
    props,
  });
}

export async function sendRosterImportComplete(
  to: string,
  props: { teamName: string; added: number; updated: number },
) {
  await sendEmail({ type: "roster-import-complete", to, props });
}

export async function sendRosterImportFailed(
  to: string,
  props: { teamName: string; errorSummary: string },
) {
  await sendEmail({ type: "roster-import-failed", to, props });
}

export async function sendMeetImportComplete(
  to: string,
  props: {
    teamName: string;
    meetName: string;
    eventsCount: number;
    entriesCount: number;
  },
) {
  await sendEmail({ type: "meet-import-complete", to, props });
}

export async function sendSwimsSyncSummary(
  to: string,
  props: {
    teamName: string;
    added: number;
    updated: number;
    removed: number;
  },
) {
  await sendEmail({ type: "swims-sync-summary", to, props });
}

export async function sendMaappAcknowledgmentRequest(
  to: string,
  props: {
    teamName: string;
    swimmerName: string;
    acknowledgeUrl: string;
    parentName?: string;
  },
) {
  await sendEmail({ type: "maapp-acknowledgment-request", to, props });
}

export async function sendSafeSportTrainingExpiring(
  to: string,
  props: {
    name: string;
    teamName: string;
    expiresAt: string;
    trainingUrl: string;
  },
) {
  await sendEmail({ type: "safesport-training-expiring", to, props });
}

export async function sendSafeSportTrainingRequired(
  to: string,
  props: { name: string; teamName: string; trainingUrl: string },
) {
  await sendEmail({ type: "safesport-training-required", to, props });
}
