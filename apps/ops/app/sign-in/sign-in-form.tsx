"use client";

import { staffAuthClient } from "@lane4hq/auth/staff-client";
import { Button } from "@lane4hq/ui/components/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@lane4hq/ui/components/field";
import { Input } from "@lane4hq/ui/components/input";
import { useState } from "react";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const result = await staffAuthClient.signIn.email({
      email,
      password,
      callbackURL: "/",
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Could not sign in");
      return;
    }
    window.location.assign("/");
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {error ? <FieldError>{error}</FieldError> : null}
        <Field>
          <FieldLabel htmlFor="ops-email">Email</FieldLabel>
          <Input
            id="ops-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="ops-password">Password</FieldLabel>
          <Input
            id="ops-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  );
}
