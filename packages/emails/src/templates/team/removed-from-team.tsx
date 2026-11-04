import { B, EmailLayout, P } from "../_layout";

export interface RemovedFromTeamProps {
  name: string;
  teamName: string;
}

export default function RemovedFromTeam({
  name,
  teamName,
}: RemovedFromTeamProps) {
  return (
    <EmailLayout
      preview={`You no longer have access to ${teamName} on Lane4 HQ.`}
      eyebrow="Team"
      heading={`You were removed from ${teamName}`}
      reason={`You're getting this because your access to ${teamName} on Lane4 HQ changed.`}
    >
      <P>
        Hi {name}, you no longer have access to <B>{teamName}</B>. Your Lane4 HQ
        account and any other teams you belong to aren&apos;t affected.
      </P>
      <P>
        If this was a mistake, ask the team&apos;s owner or head coach to invite
        you again.
      </P>
    </EmailLayout>
  );
}

RemovedFromTeam.PreviewProps = {
  name: "Alex",
  teamName: "FAST Swim Club",
} satisfies RemovedFromTeamProps;
