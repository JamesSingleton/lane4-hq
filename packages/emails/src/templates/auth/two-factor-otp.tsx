import { CodeBox, EmailLayout, P } from "../_layout";

export interface TwoFactorOtpProps {
  name: string;
  otp: string;
}

export default function TwoFactorOtp({ name, otp }: TwoFactorOtpProps) {
  return (
    <EmailLayout
      preview={`${otp} is your Lane4 HQ sign-in code.`}
      eyebrow="Account security"
      heading="Your sign-in code"
      reason="You're getting this because someone signed in to your Lane4 HQ account with your password. If it wasn't you, change your password."
    >
      <P>Hi {name}, enter this code to finish signing in:</P>
      <CodeBox code={otp} />
      <P>
        The code expires in a few minutes. Lane4 will never ask you for it by
        phone or text.
      </P>
    </EmailLayout>
  );
}

TwoFactorOtp.PreviewProps = {
  name: "Jane",
  otp: "482913",
} satisfies TwoFactorOtpProps;
