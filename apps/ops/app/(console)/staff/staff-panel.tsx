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
import { createStaffAction } from "../actions";

export function StaffPanel({
  staff,
}: {
  staff: { id: string; name: string; email: string }[];
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const result = await createStaffAction({ name, email, password });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={(event) => void onSubmit(event)}>
        <FieldGroup>
          {error ? <FieldError>{error}</FieldError> : null}
          <Field>
            <FieldLabel htmlFor="staff-name">Name</FieldLabel>
            <Input
              id="staff-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="staff-email">Email</FieldLabel>
            <Input
              id="staff-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="staff-password">Password</FieldLabel>
            <Input
              id="staff-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding..." : "Add staff"}
          </Button>
        </FieldGroup>
      </form>
      <ul className="flex flex-col gap-2">
        {staff.length === 0 ? (
          <li className="text-muted-foreground text-sm">No staff yet.</li>
        ) : (
          staff.map((member) => (
            <li key={member.id} className="rounded-md border px-3 py-2 text-sm">
              <p className="font-medium">{member.name}</p>
              <p className="text-muted-foreground">{member.email}</p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
