import { B, Details, EmailButton, EmailLayout, P, roleLabel } from "../_layout";

export interface CoachInvitationProps {
  inviterName: string;
  teamName: string;
  inviteUrl: string;
  role: string;
}

export default function CoachInvitation({
  inviterName,
  teamName,
  inviteUrl,
  role,
}: CoachInvitationProps) {
  return (
    <EmailLayout
      preview={`${inviterName} invited you to coach with ${teamName} on Lane4 HQ.`}
      eyebrow="Invitation"
      heading={`Join ${teamName} on Lane4`}
      reason={`You're getting this because ${inviterName} invited this address to ${teamName}. If you don't know them, ignore this email.`}
    >
      <P>
        <B>{inviterName}</B> invited you to help coach <B>{teamName}</B>.
      </P>
      <Details
        items={[
          { label: "Team", value: teamName },
          { label: "Your role", value: roleLabel(role) },
          { label: "Invited by", value: inviterName },
        ]}
      />
      <EmailButton href={inviteUrl} showLink>
        Accept invitation
      </EmailButton>
      <P>The invitation expires in 7 days.</P>
    </EmailLayout>
  );
}

CoachInvitation.PreviewProps = {
  inviterName: "Jane Smith",
  teamName: "FAST Swim Club",
  inviteUrl: "https://admin.lane4hq.com/accept-invite?id=abc",
  role: "assistant_coach",
} satisfies CoachInvitationProps;
