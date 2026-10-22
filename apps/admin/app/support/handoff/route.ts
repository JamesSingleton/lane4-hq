import { auth } from "@lane4hq/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function opsPeopleUrl(): string {
  const base = (process.env.OPS_URL ?? "http://localhost:3005").replace(
    /\/$/,
    "",
  );
  return `${base}/people?error=handoff`;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return NextResponse.redirect(opsPeopleUrl());
  }

  const authResponse = await auth.api.impersonateHandoff({
    body: { token },
    headers: await headers(),
    asResponse: true,
  });

  if (!authResponse.ok) {
    return NextResponse.redirect(opsPeopleUrl());
  }

  const redirect = NextResponse.redirect(new URL("/", request.url));
  for (const cookie of authResponse.headers.getSetCookie()) {
    redirect.headers.append("set-cookie", cookie);
  }
  return redirect;
}
