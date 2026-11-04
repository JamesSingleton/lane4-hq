import { B, EmailButton, EmailLayout, P } from "../_layout";

export interface MaappAcknowledgmentRequestProps {
  teamName: string;
  swimmerName: string;
  acknowledgeUrl: string;
  parentName?: string;
}

export default function MaappAcknowledgmentRequest({
  teamName,
  swimmerName,
  acknowledgeUrl,
  parentName,
}: MaappAcknowledgmentRequestProps) {
  return (
    <EmailLayout
      preview={`${teamName} needs your yearly MAAPP acknowledgment for ${swimmerName}.`}
      eyebrow="SafeSport"
      status={{ tone: "warn", label: "Action needed" }}
      heading={`Acknowledge MAAPP for ${swimmerName}`}
      reason={`You're getting this because you're listed as a parent or guardian of ${swimmerName} on ${teamName}.`}
    >
      <P>{parentName ? `Hello ${parentName},` : "Hello,"}</P>
      <P>
        Each year, <B>{teamName}</B> asks families to read and acknowledge the
        U.S. Center for SafeSport&apos;s Minor Athlete Abuse Prevention Policies
        (MAAPP) for every swimmer under 18.
      </P>
      <EmailButton href={acknowledgeUrl} showLink>
        Review and acknowledge
      </EmailButton>
      <P>Questions about the policy? Ask your swimmer&apos;s coach.</P>
    </EmailLayout>
  );
}

MaappAcknowledgmentRequest.PreviewProps = {
  teamName: "FAST Swim Club",
  swimmerName: "Ava Smith",
  acknowledgeUrl: "https://admin.lane4hq.com/maapp/abc123",
  parentName: "Chris",
} satisfies MaappAcknowledgmentRequestProps;
