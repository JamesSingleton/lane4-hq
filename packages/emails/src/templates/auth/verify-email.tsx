import { EmailButton, EmailLayout, P } from "../_layout";

export interface VerifyEmailProps {
  name: string;
  url: string;
}

export default function VerifyEmail({ name, url }: VerifyEmailProps) {
  return (
    <EmailLayout
      preview="Confirm your email to finish setting up Lane4 HQ."
      eyebrow="Account"
      heading="Confirm your email"
      reason="You're getting this because someone signed up for Lane4 HQ with this address. If it wasn't you, ignore this email and no account will be activated."
    >
      <P>Hi {name},</P>
      <P>
        Confirm this is your email address and you can start setting up your
        team: roster, meets, entries, and results.
      </P>
      <EmailButton href={url} showLink>
        Confirm email
      </EmailButton>
      <P>This link expires in 1 hour.</P>
    </EmailLayout>
  );
}

VerifyEmail.PreviewProps = {
  name: "Jane",
  url: "https://admin.lane4hq.com/api/auth/verify-email?token=abc123",
} satisfies VerifyEmailProps;
