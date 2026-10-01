import { deviceClient } from "@lane4hq/auth/device-clients";
import { auth } from "@lane4hq/auth/server";
import { getSession } from "@lane4hq/auth/session";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { DeviceApproval, type DeviceRequest } from "./device-approval";

export const metadata: Metadata = {
  title: "Sign in a device",
  description: "Approve a Lane4 app signing in to your account.",
};

/** Claims the code for this user, as the app's link intends. */
async function lookUp(userCode: string): Promise<DeviceRequest> {
  try {
    const result = await auth.api.deviceVerify({
      query: { user_code: userCode },
      headers: await headers(),
    });
    if (result.status !== "pending") {
      return {
        error: "This code was already used. Start sign-in again in the app.",
      };
    }
    const client = deviceClient((result as { client_id?: string }).client_id);
    return { code: userCode, app: client.name, returnUrl: client.returnUrl };
  } catch (error) {
    const body = (error as { body?: { error_description?: string } }).body;
    return {
      error:
        body?.error_description ??
        "That code didn't work. Check it and try again.",
    };
  }
}

export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ user_code?: string | string[] }>;
}) {
  const { user_code } = await searchParams;
  const code = typeof user_code === "string" ? user_code.trim() : "";
  const session = await getSession();
  if (!session?.user) {
    const callback = code
      ? `/device?user_code=${encodeURIComponent(code)}`
      : "/device";
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(callback)}`);
  }

  return (
    <AuthShell>
      <DeviceApproval
        initialCode={code}
        initialRequest={code ? await lookUp(code) : null}
        email={session.user.email}
      />
    </AuthShell>
  );
}
