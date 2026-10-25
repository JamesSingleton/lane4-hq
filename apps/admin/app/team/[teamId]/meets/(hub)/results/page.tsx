import { getMeets, getMeetsWithResultStats } from "@lane4hq/db/queries/meets";
import { formatDateOnlyLabel } from "@lane4hq/swim-core/calendar-date";
import { Badge } from "@lane4hq/ui/components/badge";
import type { Metadata } from "next";
import Link from "next/link";
import { MeetImportButton } from "../../meet-import-button";

export const maxDuration = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamId: string }>;
}): Promise<Metadata> {
  const { teamId } = await params;
  return {
    title: "Meet results",
    description: "Review times imported or entered for each meet.",
    alternates: { canonical: `/team/${teamId}/meets/results` },
  };
}

export default async function MeetsResultsHubPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const [meetsWithStats, meets] = await Promise.all([
    getMeetsWithResultStats(teamId),
    getMeets(teamId),
  ]);
  const withResults = meetsWithStats.filter((m) => m.resultCount > 0);
  const meetOptions = meets.map((meet) => ({
    id: meet.id,
    name: meet.name,
    startDateLabel: formatDateOnlyLabel(meet.startDate),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <MeetImportButton
          teamId={teamId}
          meets={meetOptions}
          triggerLabel="Import results file"
          triggerVariant="default"
          triggerSize="default"
        />
      </div>

      {withResults.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No meet results yet. Import a CL2, HY3, or SD3 results file (or ZIP),
          or add times from a meet.
        </p>
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {withResults.map((meet) => {
            const endLabel = meet.endDate
              ? ` – ${formatDateOnlyLabel(meet.endDate)}`
              : "";
            return (
              <li key={meet.id}>
                <Link
                  href={`/team/${teamId}/meets/${meet.id}/results`}
                  className="hover:bg-muted/40 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors"
                  prefetch={false}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{meet.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {formatDateOnlyLabel(meet.startDate)}
                      {endLabel}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {meet.athleteCount}{" "}
                    {meet.athleteCount === 1 ? "athlete" : "athletes"}
                  </Badge>
                  <span className="text-muted-foreground text-sm">
                    {meet.resultCount}{" "}
                    {meet.resultCount === 1 ? "result" : "results"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
