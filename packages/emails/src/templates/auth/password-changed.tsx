import { getBaseUrl } from "../../client";
import { Callout, EmailButton, EmailLayout, P } from "../_layout";

export interface PasswordChangedProps {
  name: string;
}

export default function PasswordChanged({ name }: PasswordChangedProps) {
  return (
    <EmailLayout
      preview="Your Lane4 HQ password was just changed."
      eyebrow="Account security"
      heading="Your password was changed"
      reason="You're getting this because the password on your Lane4 HQ account changed. We send this every time, for your security."
    >
      <P>Hi {name},</P>
      <P>The password for your Lane4 HQ account was just changed.</P>
      <Callout tone="warn">
        Didn&apos;t change it? Reset your password now. Resetting it signs out
        every device, including whoever changed it.
      </Callout>
      <EmailButton href={`${getBaseUrl()}/forgot-password`}>
        Reset password
      </EmailButton>
    </EmailLayout>
  );
}

PasswordChanged.PreviewProps = {
  name: "Jane",
} satisfies PasswordChangedProps;
