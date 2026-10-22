"use client";

import { Button } from "@lane4hq/ui/components/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@lane4hq/ui/components/field";
import { Input } from "@lane4hq/ui/components/input";
import { useState } from "react";
import { openCoachAction, searchUsersAction } from "../actions";

type Person = {
  id: string;
  name: string;
  email: string;
};

export function PeoplePanel({ handoffError }: { handoffError: boolean }) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState(
    handoffError ? "That view link expired. Search again." : "",
  );
  const [pending, setPending] = useState(false);
  const [openingId, setOpeningId] = useState("");
  const [people, setPeople] = useState<Person[]>([]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const result = await searchUsersAction(query);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setPeople([]);
      return;
    }
    setPeople(result.users);
  }

  async function openCoach(userId: string) {
    setError("");
    setOpeningId(userId);
    const result = await openCoachAction(userId);
    if (!result.ok) {
      setOpeningId("");
      setError(result.error);
      return;
    }
    window.location.assign(result.url);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={(event) => void onSubmit(event)}>
        <FieldGroup>
          {error ? <FieldError>{error}</FieldError> : null}
          <Field>
            <FieldLabel htmlFor="person-query">Name or email</FieldLabel>
            <Input
              id="person-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              required
              minLength={3}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Searching..." : "Search"}
          </Button>
        </FieldGroup>
      </form>
      <ul className="flex flex-col gap-2">
        {people.map((person) => (
          <li
            key={person.id}
            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{person.name}</p>
              <p className="text-muted-foreground truncate text-xs">
                {person.email}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={openingId !== ""}
              onClick={() => void openCoach(person.id)}
            >
              {openingId === person.id ? "Opening..." : "View as this user"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
