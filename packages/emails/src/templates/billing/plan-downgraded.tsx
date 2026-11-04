import { getBaseUrl } from "../../client";
import { B, EmailButton, EmailLayout, P } from "../_layout";

export interface PlanDowngradedProps {
  name: string;
  teamName: string;
}

export default function PlanDowngraded({
  name,
  teamName,
}: PlanDowngradedProps) {
  return (
    <EmailLayout
      preview={`${teamName} moved to the Free plan.`}
      eyebrow="Billing"
      heading={`${teamName} is on the Free plan`}
      reason={`You're getting this because you manage billing for ${teamName} on Lane4 HQ.`}
    >
      <P>
        Hi {name}, <B>{teamName}</B> moved to the Free plan. Your roster, meets,
        and results are still there. Features from your paid plan are off until
        you upgrade again.
      </P>
      <EmailButton href={getBaseUrl()}>See plans</EmailButton>
    </EmailLayout>
  );
}

PlanDowngraded.PreviewProps = {
  name: "Jane",
  teamName: "FAST Swim Club",
} satisfies PlanDowngradedProps;
