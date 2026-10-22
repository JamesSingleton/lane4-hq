import { isBetaOperator, parseOperatorEmails } from "@lane4hq/auth/beta-access";
import { keys } from "@lane4hq/auth/keys";
import { getSession } from "@lane4hq/auth/session";
import { listBetaInvites } from "@lane4hq/db/queries/beta-invites";
import type { Metadata } from "next";
import { BetaInvitesPanel } from "./beta-invites-panel";

export const metadata: Metadata = {
  title: "Beta invites",
  description: "Invite coaches into the Lane4 HQ private beta.",
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
        <h1 className="text-2xl font-bold">Beta invites</h1>
        <p className="text-muted-foreground text-sm text-balance">
          This page is for the addresses in{" "}
          <span className="font-mono">BETA_OPERATOR_EMAILS</span>. Add your
          email there and open this page again.
        </p>
      </div>
    );
  }

  const invites = await listBetaInvites();

  return (
    <BetaInvitesPanel
      invites={invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        status: invite.status,
        expiresAt: invite.expiresAt.toISOString(),
        createdAt: invite.createdAt.toISOString(),
      }))}
    />
  );
}
