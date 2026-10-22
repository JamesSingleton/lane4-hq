import type { Metadata } from "next";
import { PeoplePanel } from "./people-panel";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">People</h1>
        <p className="text-muted-foreground text-sm text-balance">
          Open a coach account on the coach app for one hour. A banner there
          brings you back here. Their team role stays the same.
        </p>
      </div>
      <PeoplePanel handoffError={params.error === "handoff"} />
    </div>
  );
}
