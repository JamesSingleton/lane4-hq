import { listBetaInvites } from "@lane4hq/db/queries/beta-invites";
import type { Metadata } from "next";
import { InvitesPanel } from "./invites-panel";

export const metadata: Metadata = { title: "Invites" };

export default async function InvitesPage() {
  const invites = await listBetaInvites();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Invites</h1>
        <p className="text-muted-foreground text-sm text-balance">
          For a coach who did not submit a request. The link expires in 14 days
          and opens the coach app.
        </p>
      </div>
      <InvitesPanel
        invites={invites.map((invite) => ({
          id: invite.id,
          email: invite.email,
          status: invite.status,
          expiresAt: invite.expiresAt.toISOString(),
        }))}
      />
    </div>
  );
}
