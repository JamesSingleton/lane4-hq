"use server";

import { Resend } from "resend";
import { reportServerException } from "@/lib/analytics";

export type SupportState = {
  error?: string;
  success?: boolean;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendSupportMessage(
  _prev: SupportState,
  formData: FormData,
): Promise<SupportState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (name.length < 2) {
    return { error: "Name needs at least two characters." };
  }
  if (!emailPattern.test(email)) {
    return { error: "Enter a valid email." };
  }
  if (message.length < 10) {
    return { error: "Message needs at least ten characters." };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SUPPORT_TO_EMAIL;
  if (!apiKey || !to) {
    return {
      error:
        "Email sending is not configured here. Open a GitHub issue instead.",
    };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Lane4 HQ <onboarding@resend.dev>",
      to,
      replyTo: email,
      subject: `Support from ${name}`,
      text: `${name} <${email}>\n\n${message}`,
    });
    if (result.error) {
      return { error: "The message could not be sent. Try GitHub issues." };
    }
    return { success: true };
  } catch (error) {
    await reportServerException("web", error, "/support");
    return { error: "The message could not be sent. Try GitHub issues." };
  }
}
