import { EmailButton, EmailLayout, P } from "../_layout";

export interface ResetPasswordProps {
  name: string;
  url: string;
}

export default function ResetPassword({ name, url }: ResetPasswordProps) {
  return (
    <EmailLayout
      preview="Choose a new password for Lane4 HQ. The link expires in 1 hour."
      eyebrow="Account"
      heading="Reset your password"
      reason="You're getting this because someone asked to reset the password for this Lane4 HQ account. If it wasn't you, ignore this email; your password won't change."
    >
      <P>Hi {name},</P>
      <P>Use the button below to choose a new password.</P>
      <EmailButton href={url} showLink>
        Choose a new password
      </EmailButton>
      <P>
        This link expires in 1 hour and works once. After you reset it,
        you&apos;ll be signed out on your other devices.
      </P>
    </EmailLayout>
  );
}

ResetPassword.PreviewProps = {
  name: "Jane",
  url: "https://admin.lane4hq.com/reset-password?token=abc123",
} satisfies ResetPasswordProps;
