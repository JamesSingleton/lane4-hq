import { getMeets } from "@lane4hq/db/queries/meets";
import {
  formatDateOnly,
  formatDateOnlyLabel,
} from "@lane4hq/swim-core/calendar-date";
import { Button } from "@lane4hq/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import type { MeetTableRow } from "@/components/meets/meets-columns";
import { MeetsTable } from "@/components/meets/meets-table";
import { MeetImportButton } from "../meet-import-button";

export const maxDuration = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamId: string }>;
}): Promise<Metadata> {
  const { teamId } = await params;
  return {
    title: "Meets",
    description:
      "Import event files or results, then build entries and export HY3.",
    alternates: { canonical: `/team/${teamId}/meets` },
  };
}

export default async function MeetsEntriesPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const meets = await getMeets(teamId);

  const meetOptions = meets.map((meet) => ({
    id: meet.id,
    name: meet.name,
    startDateLabel: formatDateOnlyLabel(meet.startDate),
  }));

  const rows: MeetTableRow[] = meets.map((meet) => ({
    id: meet.id,
    name: meet.name,
    startDate: formatDateOnly(meet.startDate),
    entryDeadline: meet.entryDeadline
      ? formatDateOnly(meet.entryDeadline)
      : null,
    course: meet.course,
    location: meet.location,
    opponents: meet.opponents,
    seasonLabel: meet.seasonLabel,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link href={`/team/${teamId}/meets/create`} prefetch={false} />
          }
        >
          Add meet
        </Button>
        <MeetImportButton
          teamId={teamId}
          meets={meetOptions}
          triggerLabel="Import meet file"
          triggerVariant="default"
          triggerSize="default"
        />
      </div>

      <MeetsTable teamId={teamId} meets={rows} />
    </div>
  );
}
