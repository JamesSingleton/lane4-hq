import { getBaseUrl } from "../../client";
import { B, EmailButton, EmailLayout, P } from "../_layout";

export interface InvitationAcceptedProps {
  inviteeName: string;
  teamName: string;
}

export default function InvitationAccepted({
  inviteeName,
  teamName,
}: InvitationAcceptedProps) {
  return (
    <EmailLayout
      preview={`${inviteeName} accepted your invitation to ${teamName}.`}
      eyebrow="Team"
      heading={`${inviteeName} joined ${teamName}`}
      reason={`You're getting this because you invited ${inviteeName} to ${teamName}.`}
    >
      <P>
        <B>{inviteeName}</B> accepted your invitation and now has access to{" "}
        <B>{teamName}</B>. You can change their role any time in team settings.
      </P>
      <EmailButton href={getBaseUrl()}>Open Lane4 HQ</EmailButton>
    </EmailLayout>
  );
}

InvitationAccepted.PreviewProps = {
  inviteeName: "Alex Rivera",
  teamName: "FAST Swim Club",
} satisfies InvitationAcceptedProps;
