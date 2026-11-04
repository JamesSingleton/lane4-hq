import { getBaseUrl } from "../../client";
import { B, EmailButton, EmailLayout, P } from "../_layout";

export interface MemberJoinedProps {
  memberName: string;
  teamName: string;
}

export default function MemberJoined({
  memberName,
  teamName,
}: MemberJoinedProps) {
  return (
    <EmailLayout
      preview={`${memberName} joined ${teamName} on Lane4 HQ.`}
      eyebrow="Team"
      heading={`${memberName} joined your team`}
      reason={`You're getting this because you manage ${teamName} on Lane4 HQ.`}
    >
      <P>
        <B>{memberName}</B> now has access to <B>{teamName}</B>. Check their
        role in team settings if they need more or less access.
      </P>
      <EmailButton href={getBaseUrl()}>Review team members</EmailButton>
    </EmailLayout>
  );
}

MemberJoined.PreviewProps = {
  memberName: "Alex Rivera",
  teamName: "FAST Swim Club",
} satisfies MemberJoinedProps;
