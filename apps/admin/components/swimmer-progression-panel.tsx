import { formatDateOnlyLabel } from "@lane4hq/swim-core/calendar-date";
import { formatBestTimeEventLabel } from "@lane4hq/swim-core/team-types";
import { formatResultMark } from "@lane4hq/swim-core/times";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lane4hq/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lane4hq/ui/components/table";
import { type BestTimeRow, BestTimesCard } from "@/components/best-times-card";
import {
  SwimmerEventChart,
  type SwimmerSeriesPoint,
} from "@/components/swimmer-event-chart";

export type SwimmerBestTimeRow = BestTimeRow;

export type SwimmerTimeHistoryRow = {
  id: string;
  source: "meet" | "manual";
  timeMs: number;
  place: number | null;
  isDq: boolean;
  dqCode?: string | null;
  label: string;
  achievedAt: Date;
  course: string;
  eventLabel: string | null;
  eventGender: string | null;
};

export function SwimmerProgressionPanel({
  teamId,
  swimmerId,
  swimmerGender,
  series,
  bestTimes,
  timeHistory,
  teamType,
  canEditBestTimes = false,
}: {
  teamId: string;
  swimmerId: string;
  swimmerGender: "male" | "female";
  series: SwimmerSeriesPoint[];
  bestTimes: SwimmerBestTimeRow[];
  timeHistory: SwimmerTimeHistoryRow[];
  teamType?: string | null;
  canEditBestTimes?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Time trend</CardTitle>
          <CardDescription>
            Select an event to see times over meets and coach-entered swims
            (lower is faster).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SwimmerEventChart series={series} teamType={teamType} />
        </CardContent>
      </Card>

      <BestTimesCard
        teamId={teamId}
        swimmerId={swimmerId}
        swimmerGender={swimmerGender}
        bestTimes={bestTimes}
        teamType={teamType}
        canEdit={canEditBestTimes}
      />

      <Card>
        <CardHeader>
          <CardTitle>Time history</CardTitle>
          <CardDescription>
            {timeHistory.length}{" "}
            {timeHistory.length === 1 ? "result" : "results"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {timeHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No times yet. Import meet results or add a best time.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Place</TableHead>
                  <TableHead>DQ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeHistory.map((result) => (
                  <TableRow key={`${result.source}-${result.id}`}>
                    <TableCell>
                      {formatDateOnlyLabel(result.achievedAt)}
                    </TableCell>
                    <TableCell>
                      <span className="block">
                        {result.source === "meet" ? "Meet" : "Manual"}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {result.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      {formatBestTimeEventLabel(
                        result.eventLabel,
                        result.course,
                        result.eventGender,
                        teamType,
                      )}
                    </TableCell>
                    <TableCell className="font-mono font-timing">
                      {formatResultMark(
                        result.timeMs,
                        result.isDq,
                        result.dqCode,
                      )}
                    </TableCell>
                    <TableCell>{result.place ?? "—"}</TableCell>
                    <TableCell>{result.isDq ? "Yes" : "No"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
