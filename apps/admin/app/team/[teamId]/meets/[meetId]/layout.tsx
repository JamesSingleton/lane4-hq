import {
  getMeetById,
  getMeetCommitments,
  getMeetEntryProgressCounts,
  getMeetRelayLegs,
} from "@lane4hq/db/queries/meets";
import { formatDateOnlyLabel } from "@lane4hq/swim-core/calendar-date";
import { listPendingExportExclusions } from "@lane4hq/swim-core/meet-attendance";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SetBreadcrumbEntity } from "@/components/breadcrumb-entities";
import { PageHeader } from "@/components/page-header";
import { DeleteMeetButton } from "../delete-meet-button";
import { MeetImportButton } from "../meet-import-button";
import { MeetExportButtons } from "./meet-export-buttons";
import { MeetHeaderLinks } from "./meet-header-links";
import { MeetMasthead } from "./meet-masthead";

export const maxDuration = 60;

export default async function MeetDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string; meetId: string }>;
}) {
  const { teamId, meetId } = await params;
  const meet = await getMeetById(meetId, teamId);
  if (!meet) notFound();

  const [entryProgress, relayLegs, commitments] = await Promise.all([
    getMeetEntryProgressCounts([meetId]),
    getMeetRelayLegs(meetId),
    getMeetCommitments(meetId),
  ]);
  const hasLineup =
    (entryProgress.get(meetId)?.entryCount ?? 0) > 0 || relayLegs.length > 0;
  const pendingExportSwimmers = listPendingExportExclusions(
    commitments.map((row) => ({
      membershipId: row.membershipId,
      status: row.status,
      firstName: row.firstName,
      lastName: row.lastName,
    })),
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <SetBreadcrumbEntity id={meetId} label={meet.name} />
      <div className="text-muted-foreground hidden text-sm md:block">
        <Link
          href={`/team/${teamId}/meets`}
          className="hover:text-foreground underline-offset-4 hover:underline"
          prefetch={false}
        >
          Meets
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{meet.name}</span>
      </div>

      <PageHeader
        title={meet.name}
        description={
          <MeetMasthead
            startDate={meet.startDate}
            endDate={meet.endDate}
            course={meet.course}
            entryDeadline={meet.entryDeadline}
            location={meet.location}
            address={meet.address}
            opponents={meet.opponents}
          />
        }
        actions={
          <>
            <MeetHeaderLinks teamId={teamId} meetId={meetId} />
            <MeetImportButton
              teamId={teamId}
              defaultMeetId={meetId}
              meets={[
                {
                  id: meet.id,
                  name: meet.name,
                  startDateLabel: formatDateOnlyLabel(meet.startDate),
                },
              ]}
            />
            <MeetExportButtons
              teamId={teamId}
              meetId={meetId}
              meetName={meet.name}
              hasLineup={hasLineup}
              pendingExportSwimmers={pendingExportSwimmers}
            />
            <DeleteMeetButton
              teamId={teamId}
              meetId={meetId}
              meetName={meet.name}
              size="sm"
            />
          </>
        }
      />

      {children}
    </div>
  );
}
