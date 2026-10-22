import { Text } from "react-email";
import { EmailButton, EmailLayout, textStyle } from "../_layout";

export interface BetaInviteProps {
  inviteUrl: string;
}

export default function BetaInvite({ inviteUrl }: BetaInviteProps) {
  return (
    <EmailLayout
      preview="You're invited to the Lane4 HQ private beta"
      heading="You're invited"
    >
      <Text style={textStyle}>
        Lane4 HQ is in private beta. This link lets you create an account and
        set up your team.
      </Text>
      <EmailButton href={inviteUrl}>Create your account</EmailButton>
      <Text style={textStyle}>This invitation expires in 14 days.</Text>
    </EmailLayout>
  );
}

BetaInvite.PreviewProps = {
  inviteUrl: "https://admin.lane4hq.com/sign-up?invite=abc",
} satisfies BetaInviteProps;
