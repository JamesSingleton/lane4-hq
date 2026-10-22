import type { ReactElement } from "react";
import { render } from "react-email";
import { getEmailFrom, getResendClient } from "./client";
import { keys } from "./keys";

export type EmailType =
  | "verify-email"
  | "reset-password"
  | "password-changed"
  | "two-factor-otp"
  | "coach-welcome"
  | "team-welcome"
  | "coach-invitation"
  | "beta-invite"
  | "beta-access-request"
  | "invitation-accepted"
  | "role-changed"
  | "removed-from-team"
  | "member-joined"
  | "subscription-confirmed"
  | "payment-failed"
  | "subscription-renewed"
  | "plan-downgraded"
  | "roster-import-complete"
  | "roster-import-failed"
  | "meet-import-complete"
  | "swims-sync-summary"
  | "maapp-acknowledgment-request"
  | "safesport-training-expiring"
  | "safesport-training-required";

export interface EmailProps {
  "verify-email": { name: string; url: string };
  "reset-password": { name: string; url: string };
  "password-changed": { name: string };
  "two-factor-otp": { name: string; otp: string };
  "coach-welcome": { name: string; dashboardUrl: string };
  "team-welcome": {
    name: string;
    teamName: string;
    teamId: string;
    baseUrl: string;
  };
  "coach-invitation": {
    inviterName: string;
    teamName: string;
    inviteUrl: string;
    role: string;
  };
  "beta-invite": { inviteUrl: string };
  "beta-access-request": {
    name: string;
    email: string;
    team: string;
    reason: string;
    reviewUrl: string;
  };
  "invitation-accepted": { inviteeName: string; teamName: string };
  "role-changed": { name: string; teamName: string; newRole: string };
  "removed-from-team": { name: string; teamName: string };
  "member-joined": { memberName: string; teamName: string };
  "subscription-confirmed": {
    name: string;
    teamName: string;
    plan: string;
    billingUrl: string;
  };
  "payment-failed": { name: string; teamName: string; billingUrl: string };
  "subscription-renewed": { name: string; teamName: string; plan: string };
  "plan-downgraded": { name: string; teamName: string };
  "roster-import-complete": {
    teamName: string;
    added: number;
    updated: number;
  };
  "roster-import-failed": { teamName: string; errorSummary: string };
  "meet-import-complete": {
    teamName: string;
    meetName: string;
    eventsCount: number;
    entriesCount: number;
  };
  "swims-sync-summary": {
    teamName: string;
    added: number;
    updated: number;
    removed: number;
  };
  "maapp-acknowledgment-request": {
    teamName: string;
    swimmerName: string;
    acknowledgeUrl: string;
    parentName?: string;
  };
  "safesport-training-expiring": {
    name: string;
    teamName: string;
    expiresAt: string;
    trainingUrl: string;
  };
  "safesport-training-required": {
    name: string;
    teamName: string;
    trainingUrl: string;
  };
}

const SUBJECTS: Record<EmailType, string> = {
  "verify-email": "Verify your email — Lane4 HQ",
  "reset-password": "Reset your password — Lane4 HQ",
  "password-changed": "Your password was changed — Lane4 HQ",
  "two-factor-otp": "Your sign-in code — Lane4 HQ",
  "coach-welcome": "Welcome to Lane4 HQ!",
  "team-welcome": "Your team is ready — Lane4 HQ",
  "coach-invitation": "You've been invited to join a team",
  "beta-invite": "You're invited to the Lane4 HQ beta",
  "beta-access-request": "Beta access request — Lane4 HQ",
  "invitation-accepted": "Invitation accepted",
  "role-changed": "Your role was updated",
  "removed-from-team": "Team access removed",
  "member-joined": "New team member joined",
  "subscription-confirmed": "Subscription confirmed",
  "payment-failed": "Payment failed — action required",
  "subscription-renewed": "Subscription renewed",
  "plan-downgraded": "Plan updated",
  "roster-import-complete": "Roster import complete",
  "roster-import-failed": "Roster import failed",
  "meet-import-complete": "Meet import complete",
  "swims-sync-summary": "USA Swimming sync complete",
  "maapp-acknowledgment-request": "MAAPP acknowledgment required",
  "safesport-training-expiring": "SafeSport training expiring soon",
  "safesport-training-required": "SafeSport training required",
};

type TemplateLoaders = {
  [K in EmailType]: () => Promise<{
    default: (props: EmailProps[K]) => ReactElement;
  }>;
};

const TEMPLATE_LOADERS = {
  "verify-email": () => import("./templates/auth/verify-email"),
  "reset-password": () => import("./templates/auth/reset-password"),
  "password-changed": () => import("./templates/auth/password-changed"),
  "two-factor-otp": () => import("./templates/auth/two-factor-otp"),
  "coach-welcome": () => import("./templates/onboarding/coach-welcome"),
  "team-welcome": () => import("./templates/onboarding/team-welcome"),
  "coach-invitation": () => import("./templates/team/coach-invitation"),
  "beta-invite": () => import("./templates/auth/beta-invite"),
  "beta-access-request": () => import("./templates/auth/beta-access-request"),
  "invitation-accepted": () => import("./templates/team/invitation-accepted"),
  "role-changed": () => import("./templates/team/role-changed"),
  "removed-from-team": () => import("./templates/team/removed-from-team"),
  "member-joined": () => import("./templates/team/member-joined"),
  "subscription-confirmed": () =>
    import("./templates/billing/subscription-confirmed"),
  "payment-failed": () => import("./templates/billing/payment-failed"),
  "subscription-renewed": () =>
    import("./templates/billing/subscription-renewed"),
  "plan-downgraded": () => import("./templates/billing/plan-downgraded"),
  "roster-import-complete": () =>
    import("./templates/ops/roster-import-complete"),
  "roster-import-failed": () => import("./templates/ops/roster-import-failed"),
  "meet-import-complete": () => import("./templates/ops/meet-import-complete"),
  "swims-sync-summary": () => import("./templates/ops/swims-sync-summary"),
  "maapp-acknowledgment-request": () =>
    import("./templates/safesport/maapp-acknowledgment-request"),
  "safesport-training-expiring": () =>
    import("./templates/safesport/safesport-training-expiring"),
  "safesport-training-required": () =>
    import("./templates/safesport/safesport-training-required"),
} satisfies TemplateLoaders;

export type SendEmailOptions<T extends EmailType> = {
  type: T;
  to: string | string[];
  props: EmailProps[T];
  idempotencyKey?: string;
};

export async function sendEmail<T extends EmailType>(
  opts: SendEmailOptions<T>,
): Promise<void> {
  if (!keys().RESEND_API_KEY) {
    console.log(`[email skipped] ${opts.type} → ${opts.to}`);
    return;
  }

  const loader = TEMPLATE_LOADERS[opts.type] as TemplateLoaders[T];
  const mod = await loader();
  const html = await render(mod.default(opts.props));

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: getEmailFrom(),
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: SUBJECTS[opts.type],
    html,
    ...(opts.idempotencyKey && {
      headers: { "Idempotency-Key": opts.idempotencyKey },
    }),
  });

  if (error) {
    console.error(`Failed to send ${opts.type}:`, error);
    throw new Error(error.message);
  }
}
