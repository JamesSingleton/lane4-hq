import { listBetaAccessRequests } from "@lane4hq/db/queries/beta-requests";
import type { Metadata } from "next";
import { RequestsPanel } from "./requests-panel";

export const metadata: Metadata = { title: "Requests" };

export default async function RequestsPage() {
  const requests = await listBetaAccessRequests();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Access requests</h1>
        <p className="text-muted-foreground text-sm text-balance">
          Approve sends the 14-day sign-up invite. Deny leaves that email able
          to request again.
        </p>
      </div>
      <RequestsPanel
        requests={requests.map((request) => ({
          id: request.id,
          name: request.name,
          email: request.email,
          team: request.team,
          reason: request.reason,
          status: request.status,
          createdAt: request.createdAt.toISOString(),
          reviewedAt: request.reviewedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
