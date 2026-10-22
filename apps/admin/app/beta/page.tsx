import { isBetaOperator, parseOperatorEmails } from "@lane4hq/auth/beta-access";
import { keys } from "@lane4hq/auth/keys";
import { getSession } from "@lane4hq/auth/session";
import { listBetaInvites } from "@lane4hq/db/queries/beta-invites";
import type { Metadata } from "next";
import { BetaInvitesPanel } from "./beta-invites-panel";
import { UserLookupPanel } from "./user-lookup-panel";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Invite coaches into the private beta and open an account to troubleshoot it.",
};

export default async function BetaPage() {
  const session = await getSession();
  const email = session?.user?.email;
  const allowed =
    !!email &&
    isBetaOperator(email, parseOperatorEmails(keys().BETA_OPERATOR_EMAILS));

  if (!allowed) {
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-3 p-6">
        <h1 className="text-2xl font-bold">Support</h1>
        <p className="text-muted-foreground text-sm text-balance">
          This page is for Lane4 support. A coach role on a team does not open
          it. Add the support address to{" "}
          <span className="font-mono">BETA_OPERATOR_EMAILS</span> and open this
          page again.
        </p>
      </div>
    );
  }

  const invites = await listBetaInvites();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Support</h1>
        <p className="text-muted-foreground text-sm text-balance">
          Lane4 support can invite a coach into the beta, or open that coach's
          account to troubleshoot a report. Team roles do not include this.
          Team invitations from Settings still let a coach join an existing
          team.
        </p>
      </div>
      <BetaInvitesPanel
        invites={invites.map((invite) => ({
          id: invite.id,
          email: invite.email,
          status: invite.status,
          expiresAt: invite.expiresAt.toISOString(),
          createdAt: invite.createdAt.toISOString(),
        }))}
      />
      <UserLookupPanel />
    </div>
  );
}
