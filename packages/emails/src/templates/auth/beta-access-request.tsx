import { Text } from "react-email";
import { EmailButton, EmailLayout, textStyle } from "../_layout";

export interface BetaAccessRequestProps {
  name: string;
  email: string;
  team: string;
  reason: string;
  reviewUrl: string;
}

export default function BetaAccessRequestEmail({
  name,
  email,
  team,
  reason,
  reviewUrl,
}: BetaAccessRequestProps) {
  return (
    <EmailLayout
      preview={`${name} requested access to the Lane4 HQ beta`}
      heading="New access request"
    >
      <Text style={textStyle}>
        {name} ({email}) from {team} asked to join the private beta.
      </Text>
      <Text style={textStyle}>{reason}</Text>
      <EmailButton href={reviewUrl}>Review requests</EmailButton>
    </EmailLayout>
  );
}

BetaAccessRequestEmail.PreviewProps = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  team: "Example High School",
  reason: "We enter duals every week and retype seed times the night before.",
  reviewUrl: "https://admin.lane4hq.com/beta",
} satisfies BetaAccessRequestProps;
