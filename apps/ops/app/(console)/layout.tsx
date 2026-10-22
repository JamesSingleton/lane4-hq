import { getStaffSession } from "@lane4hq/auth/staff-session";
import { redirect } from "next/navigation";
import { OpsShell } from "./ops-shell";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getStaffSession();
  if (!session?.user?.email) redirect("/sign-in");
  return <OpsShell email={session.user.email}>{children}</OpsShell>;
}
