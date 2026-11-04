import { B, Details, EmailLayout, P } from "../_layout";

export interface SubscriptionRenewedProps {
  name: string;
  teamName: string;
  plan: string;
}

export default function SubscriptionRenewed({
  name,
  teamName,
  plan,
}: SubscriptionRenewedProps) {
  return (
    <EmailLayout
      preview={`${teamName}'s ${plan} plan renewed.`}
      eyebrow="Billing"
      status={{ tone: "ok", label: "Renewed" }}
      heading="Your subscription renewed"
      reason={`You're getting this because you manage billing for ${teamName} on Lane4 HQ.`}
    >
      <P>
        Hi {name}, the <B>{plan}</B> plan for <B>{teamName}</B> renewed. Nothing
        changes for your team.
      </P>
      <Details
        items={[
          { label: "Team", value: teamName },
          { label: "Plan", value: plan },
        ]}
      />
    </EmailLayout>
  );
}

SubscriptionRenewed.PreviewProps = {
  name: "Jane",
  teamName: "FAST Swim Club",
  plan: "Pro",
} satisfies SubscriptionRenewedProps;
