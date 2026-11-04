import { B, Details, EmailButton, EmailLayout, P } from "../_layout";

export interface SubscriptionConfirmedProps {
  name: string;
  teamName: string;
  plan: string;
  billingUrl: string;
}

export default function SubscriptionConfirmed({
  name,
  teamName,
  plan,
  billingUrl,
}: SubscriptionConfirmedProps) {
  return (
    <EmailLayout
      preview={`${teamName} is on the ${plan} plan. Thanks for subscribing.`}
      eyebrow="Billing"
      status={{ tone: "ok", label: "Active" }}
      heading={`${teamName} is on ${plan}`}
      reason={`You're getting this because you manage billing for ${teamName} on Lane4 HQ.`}
    >
      <P>
        Thanks, {name}. <B>{teamName}</B> is upgraded and the new features are
        on now.
      </P>
      <Details
        items={[
          { label: "Team", value: teamName },
          { label: "Plan", value: plan },
        ]}
      />
      <EmailButton href={billingUrl}>Manage billing</EmailButton>
      <P>Receipts and invoices are on the billing page.</P>
    </EmailLayout>
  );
}

SubscriptionConfirmed.PreviewProps = {
  name: "Jane",
  teamName: "FAST Swim Club",
  plan: "Pro",
  billingUrl: "https://admin.lane4hq.com/team/team_123/settings/billing",
} satisfies SubscriptionConfirmedProps;
