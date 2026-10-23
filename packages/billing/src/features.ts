import { tagException } from "@lane4hq/analytics";
import {
  getOwnerEmail,
  getTeamPlan,
  updateSubscription,
} from "@lane4hq/db/queries/billing";
import {
  getPlanLimits,
  type PlanFeature,
  planHasFeature,
} from "@lane4hq/swim-core/plans";

export type { PlanFeature, PlanTier } from "@lane4hq/swim-core/plans";
export {
  getPlanLimits,
  PLAN_LIMITS,
  planHasFeature,
} from "@lane4hq/swim-core/plans";

export async function assertFeature(
  organizationId: string,
  feature: PlanFeature,
): Promise<void> {
  const plan = await getTeamPlan(organizationId);
  if (!planHasFeature(plan, feature)) {
    throw tagException(
      new Error("That is not included on this plan."),
      "plan_feature",
    );
  }
}

export async function getTeamPlanLimits(organizationId: string) {
  const plan = await getTeamPlan(organizationId);
  return getPlanLimits(plan);
}

/** Active roster slots left on the team's plan (Infinity when unlimited). */
export async function remainingSwimmerSlots(
  organizationId: string,
): Promise<number> {
  const limits = await getTeamPlanLimits(organizationId);
  if (limits.maxSwimmers === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY;
  }
  const { getRosterStats } = await import("@lane4hq/db/queries/roster");
  const stats = await getRosterStats(organizationId);
  return Math.max(0, (limits.maxSwimmers as number) - stats.totalSwimmers);
}

export async function canAddSwimmer(organizationId: string): Promise<boolean> {
  return (await remainingSwimmerSlots(organizationId)) > 0;
}

export { getOwnerEmail, getTeamPlan, updateSubscription };
