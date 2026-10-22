"use client";

import { authClient } from "@lane4hq/auth/client";
import type { PlanTier } from "@lane4hq/swim-core/plans";
import { Button } from "@lane4hq/ui/components/button";
import { useState } from "react";

export function BillingActions({
  teamId,
  currentPlan,
  locked = false,
}: {
  teamId: string;
  currentPlan: PlanTier;
  locked?: boolean;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleUpgrade(plan: "pro" | "enterprise") {
    setError("");
    setLoading(plan);
    const result = await authClient.checkout({
      slug: plan,
      referenceId: teamId,
    });
    if (result.error) {
      setError(result.error.message ?? "Checkout failed");
      setLoading(null);
    }
  }

  async function handlePortal() {
    setError("");
    setLoading("portal");
    const result = await authClient.customer.portal();
    if (result.error) {
      setError(result.error.message ?? "Could not open billing");
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {locked ? (
        <p className="text-muted-foreground text-sm">
          Billing stays on the real sign-in. Stop from the banner first.
        </p>
      ) : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {currentPlan === "free" && (
          <>
            <Button
              onClick={() => handleUpgrade("pro")}
              disabled={!!loading || locked}
            >
              {loading === "pro" ? "Loading…" : "Upgrade to Pro"}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleUpgrade("enterprise")}
              disabled={!!loading || locked}
            >
              {loading === "enterprise" ? "Loading…" : "Upgrade to Enterprise"}
            </Button>
          </>
        )}
        {currentPlan !== "free" && (
          <Button onClick={handlePortal} disabled={!!loading || locked}>
            {loading === "portal" ? "Loading…" : "Manage billing"}
          </Button>
        )}
      </div>
    </div>
  );
}
