"use client";

import { Button } from "@lane4hq/ui/components/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@lane4hq/ui/components/field";
import { Input } from "@lane4hq/ui/components/input";
import { Textarea } from "@lane4hq/ui/components/textarea";
import Link from "next/link";
import { useState } from "react";
import { submitAccessRequestAction } from "./actions";

export function RequestAccessForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [team, setTeam] = useState("");
  const [reason, setReason] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const result = await submitAccessRequestAction({
      name,
      email,
      team,
      reason,
      website,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(result.message);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-2xl font-bold">Request received</h1>
        <p className="text-muted-foreground text-sm text-balance">{done}</p>
        <p className="text-sm">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="underline underline-offset-4"
            prefetch={false}
          >
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="w-full">
      <FieldGroup>
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-bold">Request access</h1>
          <p className="text-muted-foreground text-sm text-balance">
            Lane4 is in a private beta for club and high school coaches. Tell us
            about your team and why you want to use it. If it&apos;s a fit,
            we&apos;ll email an invite. If it isn&apos;t, you won&apos;t get
            one.
          </p>
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        <Field>
          <FieldLabel htmlFor="request-name">Name</FieldLabel>
          <Input
            id="request-name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            maxLength={80}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="request-email">Email</FieldLabel>
          <Input
            id="request-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={200}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="request-team">Team or school</FieldLabel>
          <Input
            id="request-team"
            name="team"
            autoComplete="organization"
            value={team}
            onChange={(event) => setTeam(event.target.value)}
            minLength={2}
            maxLength={120}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="request-reason">
            Why do you want to use Lane4?
          </FieldLabel>
          <Textarea
            id="request-reason"
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={20}
            maxLength={2000}
            rows={5}
            required
            placeholder="Club or high school, the meets you enter, and what you want Lane4 to handle."
          />
        </Field>
        <div
          className="absolute -left-[9999px] h-0 overflow-hidden"
          aria-hidden
        >
          <label htmlFor="request-website">Website</label>
          <input
            id="request-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending..." : "Request access"}
        </Button>
        <p className="text-center text-sm">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="underline underline-offset-4"
            prefetch={false}
          >
            Sign in
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
