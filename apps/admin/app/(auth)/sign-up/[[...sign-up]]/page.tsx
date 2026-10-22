import { getSession } from "@lane4hq/auth/session";
import {
  findOpenBetaInviteByToken,
  findOpenTeamInvitationById,
} from "@lane4hq/db/queries/beta-invites";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { PrivateBetaNotice } from "@/components/auth/private-beta-notice";
import { SignupForm } from "@/components/auth/signup-form";
import { getCallbackURL, invitationIdFromCallback } from "@/lib/auth-callback";
import { getConfiguredSocialProviders } from "@/lib/auth-providers";
import { resolveSignupGate } from "@/lib/signup-gate";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Lane4 HQ is in private beta. An invitation is required.",
};

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value[0]) return value[0];
  return null;
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (session?.user?.id) {
    const params = await searchParams;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") query.set(key, value);
      else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
    }
    redirect(getCallbackURL(query, "/onboarding"));
  }

  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
  }
  const callbackUrl = getCallbackURL(query, "/onboarding");
  const inviteToken = firstParam(params.invite);
  const invitationId = invitationIdFromCallback(callbackUrl);
  let betaInvite: { email: string } | null = null;
  let teamInvite: { email: string } | null = null;
  if (inviteToken || invitationId) {
    try {
      [betaInvite, teamInvite] = await Promise.all([
        inviteToken
          ? findOpenBetaInviteByToken(inviteToken)
          : Promise.resolve(null),
        invitationId
          ? findOpenTeamInvitationById(invitationId)
          : Promise.resolve(null),
      ]);
    } catch (error) {
      console.error("Signup invite lookup failed", error);
      return (
        <AuthShell>
          <PrivateBetaNotice reason="invalid" />
        </AuthShell>
      );
    }
  }
  const gate = resolveSignupGate({
    inviteToken,
    betaInvite,
    callbackUrl,
    teamInvite,
  });

  if (gate.status === "denied") {
    return (
      <AuthShell>
        <PrivateBetaNotice reason={gate.reason} />
      </AuthShell>
    );
  }

  const socialProviders = getConfiguredSocialProviders();

  return (
    <AuthShell>
      <Suspense
        fallback={
          <p className="text-muted-foreground text-center text-sm">
            Loading...
          </p>
        }
      >
        <SignupForm
          socialProviders={socialProviders}
          lockedEmail={gate.email}
          inviteSource={gate.source}
        />
      </Suspense>
    </AuthShell>
  );
}
