import { B, Callout, EmailButton, EmailLayout, P } from "../_layout";

export interface SafeSportTrainingExpiringProps {
  name: string;
  teamName: string;
  expiresAt: string;
  trainingUrl: string;
}

export default function SafeSportTrainingExpiring({
  name,
  teamName,
  expiresAt,
  trainingUrl,
}: SafeSportTrainingExpiringProps) {
  return (
    <EmailLayout
      preview={`Your SafeSport training expires ${expiresAt}. Renew it to keep access to minor athletes' details.`}
      eyebrow="SafeSport"
      status={{ tone: "warn", label: "Expires soon" }}
      heading="Your SafeSport training expires soon"
      reason={`You're getting this because ${teamName} requires current SafeSport training for coaches.`}
    >
      <P>
        Hi {name}, your SafeSport training on file for <B>{teamName}</B> expires
        on <B>{expiresAt}</B>.
      </P>
      <Callout tone="warn">
        Once it lapses, Lane4 hides minor athletes&apos; contact and medical
        details from you until it&apos;s renewed.
      </Callout>
      <EmailButton href={trainingUrl}>Renew training</EmailButton>
    </EmailLayout>
  );
}

SafeSportTrainingExpiring.PreviewProps = {
  name: "Jane",
  teamName: "FAST Swim Club",
  expiresAt: "December 1, 2026",
  trainingUrl: "https://safesporttrained.org",
} satisfies SafeSportTrainingExpiringProps;
