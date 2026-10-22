import { getStaffSession } from "@lane4hq/auth/staff-session";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  const session = await getStaffSession();
  if (session?.user) redirect("/");
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Lane4 Ops</h1>
        <p className="text-muted-foreground text-sm text-balance">
          Sign in with your Lane4 staff account. Coach, swimmer, and parent
          accounts stay on the coach app.
        </p>
      </div>
      <SignInForm />
    </main>
  );
}
