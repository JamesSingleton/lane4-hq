import { listStaff } from "@lane4hq/db/queries/staff";
import type { Metadata } from "next";
import { StaffPanel } from "./staff-panel";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const rows = await listStaff();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Staff</h1>
        <p className="text-muted-foreground text-sm">
          Lane4 employees who can sign in here. This is not a coach account.
        </p>
      </div>
      <StaffPanel
        staff={rows.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
        }))}
      />
    </div>
  );
}
