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

/** Subject lines say what happened and, when it helps, to which team. */
const SUBJECTS: { [K in EmailType]: (props: EmailProps[K]) => string } = {
  "verify-email": () => "Confirm your email for Lane4 HQ",
  "reset-password": () => "Reset your Lane4 HQ password",
  "password-changed": () => "Your Lane4 HQ password was changed",
  "two-factor-otp": (p) => `${p.otp} is your Lane4 HQ sign-in code`,
  "coach-welcome": () => "Welcome to Lane4 HQ",
  "team-welcome": (p) => `${p.teamName} is ready on Lane4 HQ`,
  "coach-invitation": (p) =>
    `${p.inviterName} invited you to ${p.teamName} on Lane4 HQ`,
  "invitation-accepted": (p) => `${p.inviteeName} joined ${p.teamName}`,
  "role-changed": (p) => `Your role on ${p.teamName} changed`,
  "removed-from-team": (p) => `You were removed from ${p.teamName}`,
  "member-joined": (p) => `${p.memberName} joined ${p.teamName}`,
  "subscription-confirmed": (p) => `${p.teamName} is on the ${p.plan} plan`,
  "payment-failed": (p) => `Action needed: payment failed for ${p.teamName}`,
  "subscription-renewed": (p) => `${p.teamName}'s ${p.plan} plan renewed`,
  "plan-downgraded": (p) => `${p.teamName} moved to the Free plan`,
  "roster-import-complete": (p) => `Roster import finished for ${p.teamName}`,
  "roster-import-failed": (p) =>
    `Roster import didn't finish for ${p.teamName}`,
  "meet-import-complete": (p) => `${p.meetName} is imported`,
  "swims-sync-summary": (p) => `USA Swimming sync finished for ${p.teamName}`,
  "maapp-acknowledgment-request": (p) =>
    `Action needed: MAAPP acknowledgment for ${p.swimmerName}`,
  "safesport-training-expiring": () => "Your SafeSport training expires soon",
  "safesport-training-required": (p) =>
    `SafeSport training needed for ${p.teamName}`,
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
  const email = mod.default(opts.props);
  // Plain text alongside HTML: better for spam filters, screen readers, and
  // text-only mail clients.
  const [html, text] = await Promise.all([
    render(email),
    render(email, { plainText: true }),
  ]);
  const subject = (SUBJECTS[opts.type] as (props: EmailProps[T]) => string)(
    opts.props,
  );

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: getEmailFrom(),
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject,
    html,
    text,
    ...(opts.idempotencyKey && {
      headers: { "Idempotency-Key": opts.idempotencyKey },
    }),
  });

  if (error) {
    console.error(`Failed to send ${opts.type}:`, error);
    throw new Error(error.message);
  }
}
