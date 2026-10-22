"use client";

import { Button } from "@lane4hq/ui/components/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@lane4hq/ui/components/field";
import { Input } from "@lane4hq/ui/components/input";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBetaInviteAction, revokeBetaInviteAction } from "../actions";

export type InviteRow = {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
};

export function InvitesPanel({ invites }: { invites: InviteRow[] }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [emailed, setEmailed] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInviteUrl("");
    setPending(true);
    const result = await createBetaInviteAction(email);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEmail("");
    setInviteUrl(result.inviteUrl);
    setEmailed(result.emailed);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={(event) => void onSubmit(event)}>
        <FieldGroup>
          {error ? <FieldError>{error}</FieldError> : null}
          <Field>
            <FieldLabel htmlFor="invite-email">Email</FieldLabel>
            <Input
              id="invite-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending..." : "Send invite"}
          </Button>
          {inviteUrl ? (
            <Field>
              <FieldLabel htmlFor="invite-link">Invite link</FieldLabel>
              <Input id="invite-link" readOnly value={inviteUrl} />
              <p className="text-muted-foreground text-sm">
                {emailed
                  ? "Email sent. You can also copy this link."
                  : "The email did not send. Copy this link instead."}
              </p>
            </Field>
          ) : null}
        </FieldGroup>
      </form>
      <ul className="flex flex-col gap-2">
        {invites.length === 0 ? (
          <li className="text-muted-foreground text-sm">No invites yet.</li>
        ) : (
          invites.map((invite) => (
            <li
              key={invite.id}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{invite.email}</p>
                <p className="text-muted-foreground text-xs">
                  {invite.status}
                  {invite.status === "pending"
                    ? ` until ${new Date(invite.expiresAt).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              {invite.status === "pending" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void revokeBetaInviteAction(invite.id).then(() => {
                      router.refresh();
                    });
                  }}
                >
                  Revoke
                </Button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
