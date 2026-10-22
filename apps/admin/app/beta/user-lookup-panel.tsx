"use client";

import { authClient } from "@lane4hq/auth/client";
import { Button } from "@lane4hq/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lane4hq/ui/components/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@lane4hq/ui/components/field";
import { Input } from "@lane4hq/ui/components/input";
import { useState } from "react";
import { searchUsersAction } from "./actions";

type SupportUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  canImpersonate: boolean;
};

export function UserLookupPanel() {
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [openingId, setOpeningId] = useState("");
  const [users, setUsers] = useState<SupportUser[]>([]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const result = await searchUsersAction(query);
    setPending(false);
    if (!result.ok) {
      setUsers([]);
      setError(result.error);
      return;
    }
    setUsers(result.users);
    if (result.users.length === 0) {
      setError("No matching accounts.");
    }
  }

  async function openUser(userId: string) {
    setError("");
    setOpeningId(userId);
    const result = await authClient.impersonateUser({ userId });
    if (result.error) {
      setOpeningId("");
      setError(result.error.message ?? "Could not open that account");
      return;
    }
    window.location.assign("/");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Look up a user</CardTitle>
        <CardDescription>
          Support opens the coach's account for one hour. A banner at the top
          of every page returns you here. The coach's team role is unchanged.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void onSubmit(event)}>
          <FieldGroup>
            {error ? <FieldError>{error}</FieldError> : null}
            <Field>
              <FieldLabel htmlFor="support-query">Name or email</FieldLabel>
              <Input
                id="support-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoComplete="off"
                required
                minLength={3}
              />
            </Field>
            <Button type="submit" disabled={pending || openingId.length > 0}>
              {pending ? "Searching..." : "Search"}
            </Button>
          </FieldGroup>
        </form>
        {users.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {users.map((user) => (
              <li
                key={user.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {user.email}
                  </p>
                </div>
                {user.canImpersonate ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={openingId.length > 0}
                    onClick={() => void openUser(user.id)}
                  >
                    {openingId === user.id ? "Opening..." : "View as this user"}
                  </Button>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    Can't view
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
