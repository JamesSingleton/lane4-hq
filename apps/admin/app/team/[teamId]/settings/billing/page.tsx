import { impersonatorId } from "@lane4hq/auth/impersonation";
import { getSession } from "@lane4hq/auth/session";
import { getAiQuotaStatus } from "@lane4hq/db/queries/ai-quota";
import { getTeamPlan, getTeamSubscription } from "@lane4hq/db/queries/billing";
import { PLAN_LIMITS } from "@lane4hq/swim-core/plans";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lane4hq/ui/components/alert";
import { Progress } from "@lane4hq/ui/components/progress";
import { Separator } from "@lane4hq/ui/components/separator";
import type { Metadata } from "next";
import { NotPermittedPanel } from "@/components/not-permitted-panel";
import { getTeamCapabilitiesForCurrentMember } from "@/lib/team-member-capabilities";
import { SettingsSection } from "../settings-section";
import { BillingActions } from "./billing-actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamId: string }>;
}): Promise<Metadata> {
  const { teamId } = await params;
  return {
    title: "Billing",
    description: "Plan, subscription, and usage.",
    alternates: { canonical: `/team/${teamId}/settings/billing` },
  };
}

export default async function BillingSettingsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const { canManageTeam } = await getTeamCapabilitiesForCurrentMember(teamId);
  if (!canManageTeam) {
    return (
      <NotPermittedPanel
        title="Billing is restricted"
        description="Only team owners and head coaches can view billing and subscription settings."
      />
    );
  }

  const session = await getSession();
  const viewingAsUser = impersonatorId(session?.session) !== null;
  const [plan, subscription, quota] = await Promise.all([
    getTeamPlan(teamId),
    getTeamSubscription(teamId),
    getAiQuotaStatus(teamId),
  ]);
  const limits = PLAN_LIMITS[plan];
  const included = limits.aiGenerationsIncluded;
  const usagePct =
    included > 0 && included !== Number.POSITIVE_INFINITY
      ? Math.min(100, Math.round((quota.used / included) * 100))
      : 0;

  return (
    <div className="flex flex-col">
      {plan === "free" ? (
        <Alert className="mb-6">
          <AlertTitle>Free plan</AlertTitle>
          <AlertDescription>
            Upgrade to Pro for extra coaches, lineup suggestions, and cut
            tracking.
          </AlertDescription>
        </Alert>
      ) : null}

      <SettingsSection
        title="Plan"
        description="Software access for this team via Polar."
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-medium capitalize">{plan} plan</h4>
              <p className="text-muted-foreground text-sm">
                Status: {subscription?.status ?? "active"}
              </p>
            </div>
          </div>
          <Separator className="my-1" />
          <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
            <li>
              Up to{" "}
              {limits.maxSwimmers === Number.POSITIVE_INFINITY
                ? "unlimited"
                : limits.maxSwimmers}{" "}
              swimmers
            </li>
            <li>
              Up to{" "}
              {limits.maxCoaches === Number.POSITIVE_INFINITY
                ? "unlimited"
                : limits.maxCoaches}{" "}
              coaches
            </li>
            <li>
              Relay suggestions &amp; workout drafts:{" "}
              {included === Number.POSITIVE_INFINITY
                ? "Unlimited"
                : `${included}/mo`}{" "}
              (shared pool)
            </li>
            <li>Meet import: {limits.meetImport ? "Yes" : "No"}</li>
            <li>Progression tracking: {limits.progression ? "Yes" : "No"}</li>
            <li>SWIMS sync: {limits.swimsSync ? "Yes" : "No"}</li>
            <li>
              Lineup suggestions: {limits.lineupSuggestions ? "Yes" : "No"}
            </li>
            <li>Cut tracker: {limits.advancedAnalytics ? "Yes" : "No"}</li>
          </ul>
          <BillingActions
            teamId={teamId}
            currentPlan={plan}
            locked={viewingAsUser}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Relay suggestions & workout drafts"
        description="One monthly pool for relay order suggestions and workout drafts. Each Suggest click uses one."
        showSeparator
      >
        <div className="flex w-full max-w-md flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">This month</span>
            <span className="text-muted-foreground tabular-nums">
              {quota.used} /{" "}
              {included === Number.POSITIVE_INFINITY ? "∞" : included}
            </span>
          </div>
          <Progress value={usagePct} className="w-full" />
          <p className="text-muted-foreground text-sm">
            {quota.overageAllowed && quota.remaining === 0
              ? "Included quota used — extra allowed on this plan."
              : `${quota.remaining} left this month.`}
          </p>
        </div>
      </SettingsSection>
    </div>
  );
}
