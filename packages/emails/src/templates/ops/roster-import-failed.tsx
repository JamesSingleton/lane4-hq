import { B, Callout, EmailLayout, P } from "../_layout";

export interface RosterImportFailedProps {
  teamName: string;
  errorSummary: string;
}

export default function RosterImportFailed({
  teamName,
  errorSummary,
}: RosterImportFailedProps) {
  return (
    <EmailLayout
      preview={`The roster import for ${teamName} didn't finish.`}
      eyebrow="Roster import"
      status={{ tone: "stop", label: "Not imported" }}
      heading="Your roster import didn't finish"
      reason={`You're getting this because you imported a roster file for ${teamName}.`}
    >
      <P>
        Nothing was changed on <B>{teamName}</B>. Here&apos;s what went wrong:
      </P>
      <Callout tone="stop">{errorSummary}</Callout>
      <P>Fix the file and import it again.</P>
    </EmailLayout>
  );
}

RosterImportFailed.PreviewProps = {
  teamName: "FAST Swim Club",
  errorSummary: "Row 14 has no birth date, so the swimmer can't be matched.",
} satisfies RosterImportFailedProps;
