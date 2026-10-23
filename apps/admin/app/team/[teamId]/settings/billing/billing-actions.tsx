"use client";

import { authClient } from "@lane4hq/auth/client";
import type { PlanTier } from "@lane4hq/swim-core/plans";
import { Button } from "@lane4hq/ui/components/button";
import { useState } from "react";

export function BillingActions({
  teamId,
  currentPlan,
}: {
  teamId: string;
  currentPlan: PlanTier;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleUpgrade(plan: "pro" | "enterprise") {
    setLoading(plan);
    try {
      await authClient.checkout({
        slug: plan,
        reference_id: teamId,
      });
    } catch (error) {
      console.error(error);
      setLoading(null);
    }
  }

  async function handlePortal() {
    setLoading("portal");
    try {
      await authClient.customer.portal();
    } catch (error) {
      console.error(error);
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {currentPlan === "free" && (
        <>
          <Button onClick={() => handleUpgrade("pro")} disabled={!!loading}>
            {loading === "pro" ? "Loading…" : "Upgrade to Pro"}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleUpgrade("enterprise")}
            disabled={!!loading}
          >
            {loading === "enterprise" ? "Loading…" : "Upgrade to Enterprise"}
          </Button>
        </>
      )}
      {currentPlan !== "free" && (
        <Button onClick={handlePortal} disabled={!!loading}>
          {loading === "portal" ? "Loading…" : "Manage billing"}
        </Button>
      )}
    </div>
  );
}
