"use client";

import { Button } from "@lane4hq/ui/components/button";
import { Field, FieldError, FieldLabel } from "@lane4hq/ui/components/field";
import { Input } from "@lane4hq/ui/components/input";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { reviewBetaAccessRequestAction } from "../actions";

export type AccessRequestRow = {
  id: string;
  name: string;
  email: string;
  team: string;
  reason: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
};

export function RequestsPanel({ requests }: { requests: AccessRequestRow[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [emailed, setEmailed] = useState(false);
  const pending = requests.filter((request) => request.status === "pending");
  const reviewed = requests.filter((request) => request.status !== "pending");

  async function review(id: string, decision: "approved" | "denied") {
    setError("");
    setInviteUrl("");
    setPendingId(id);
    const result = await reviewBetaAccessRequestAction(id, decision);
    setPendingId("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.inviteUrl) {
      setInviteUrl(result.inviteUrl);
      setEmailed(result.emailed === true);
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <FieldError>{error}</FieldError> : null}
      {pending.length === 0 ? (
        <p className="text-muted-foreground text-sm">No open requests.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((request) => (
            <li
              key={request.id}
              className="flex flex-col gap-2 rounded-md border p-3"
            >
              <p className="text-sm font-medium">
                {request.name}{" "}
                <span className="text-muted-foreground font-normal">
                  {request.email}
                </span>
              </p>
              <p className="text-muted-foreground text-xs">
                {request.team} ·{" "}
                {new Date(request.createdAt).toLocaleDateString()}
              </p>
              <p className="text-sm whitespace-pre-wrap break-words">
                {request.reason}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={pendingId !== ""}
                  onClick={() => void review(request.id, "approved")}
                >
                  {pendingId === request.id ? "Saving..." : "Approve"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pendingId !== ""}
                  onClick={() => void review(request.id, "denied")}
                >
                  Deny
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {inviteUrl ? (
        <Field>
          <FieldLabel htmlFor="approved-invite-link">Invite link</FieldLabel>
          <Input id="approved-invite-link" readOnly value={inviteUrl} />
          <p className="text-muted-foreground text-sm">
            {emailed
              ? "Email sent. You can also copy this link."
              : "The email did not send. Copy this link instead."}
          </p>
        </Field>
      ) : null}
      {reviewed.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Recent decisions</h2>
          <ul className="flex flex-col gap-2">
            {reviewed.map((request) => (
              <li key={request.id} className="text-sm">
                <span className="font-medium">{request.email}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {request.status}
                  {request.reviewedAt
                    ? ` ${new Date(request.reviewedAt).toLocaleDateString()}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
