"use client";

import { authClient } from "@lane4hq/auth/client";
import { Button } from "@lane4hq/ui/components/button";
import { useState } from "react";

export function ImpersonationBanner({
  name,
  email,
  returnTo = "http://localhost:3005",
}: {
  name: string;
  email: string;
  returnTo?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function stop() {
    setError("");
    setPending(true);
    const result = await authClient.stopImpersonating();
    if (result.error) {
      setPending(false);
      setError(result.error.message ?? "Could not restore your session");
      return;
    }
    window.location.assign(returnTo);
  }

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 bg-foreground px-4 py-2 text-background"
    >
      <p className="text-sm text-balance">
        You are viewing Lane4 as <span className="font-medium">{name}</span> (
        {email}). Changes are saved to this account.
        {error ? ` ${error}` : ""}
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => void stop()}
      >
        {pending ? "Restoring..." : "Stop"}
      </Button>
    </div>
  );
}
