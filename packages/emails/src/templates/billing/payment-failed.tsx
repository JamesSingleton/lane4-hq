import { B, Callout, EmailButton, EmailLayout, P } from "../_layout";

export interface PaymentFailedProps {
  name: string;
  teamName: string;
  billingUrl: string;
}

export default function PaymentFailed({
  name,
  teamName,
  billingUrl,
}: PaymentFailedProps) {
  return (
    <EmailLayout
      preview={`We couldn't charge the payment method for ${teamName}. Update it to keep your plan.`}
      eyebrow="Billing"
      status={{ tone: "stop", label: "Action needed" }}
      heading="Your payment didn't go through"
      reason={`You're getting this because you manage billing for ${teamName} on Lane4 HQ.`}
    >
      <P>
        Hi {name}, we couldn&apos;t charge the payment method for{" "}
        <B>{teamName}</B>.
      </P>
      <Callout tone="stop">
        Update your payment method so {teamName} keeps its paid features.
      </Callout>
      <EmailButton href={billingUrl}>Update payment method</EmailButton>
    </EmailLayout>
  );
}

PaymentFailed.PreviewProps = {
  name: "Jane",
  teamName: "FAST Swim Club",
  billingUrl: "https://admin.lane4hq.com/team/team_123/settings/billing",
} satisfies PaymentFailedProps;
