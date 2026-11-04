import { B, EmailButton, EmailLayout, P } from "../_layout";

export interface SafeSportTrainingRequiredProps {
  name: string;
  teamName: string;
  trainingUrl: string;
}

export default function SafeSportTrainingRequired({
  name,
  teamName,
  trainingUrl,
}: SafeSportTrainingRequiredProps) {
  return (
    <EmailLayout
      preview={`Finish SafeSport training to see minor athletes' details on ${teamName}.`}
      eyebrow="SafeSport"
      status={{ tone: "warn", label: "Action needed" }}
      heading="SafeSport training needed"
      reason={`You're getting this because ${teamName} requires current SafeSport training for coaches.`}
    >
      <P>
        Hi {name}, Lane4 blocked access to a minor athlete&apos;s contact or
        medical details on <B>{teamName}</B> because there&apos;s no current
        SafeSport training on file for you.
      </P>
      <P>
        Complete the training. Access comes back as soon as your training is
        recorded in Lane4.
      </P>
      <EmailButton href={trainingUrl}>Start training</EmailButton>
    </EmailLayout>
  );
}

SafeSportTrainingRequired.PreviewProps = {
  name: "Jane",
  teamName: "FAST Swim Club",
  trainingUrl: "https://safesporttrained.org",
} satisfies SafeSportTrainingRequiredProps;
