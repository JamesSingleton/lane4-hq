import {
  displayTime,
  eventTitle,
  finalLabel,
  indexMeet,
  markLabel,
} from "@lane4hq/meet-engine/labels";
import {
  eventProgress,
  eventStandings,
  teamScores,
} from "@lane4hq/meet-engine/standings";
import { Badge } from "@lane4hq/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lane4hq/ui/components/table";
import { useMemo, useState } from "react";
import { EventList } from "../components/event-list";
import { PrintButton } from "../components/print-button";
import { useMeet } from "../state/meet-context";

export function ResultsScreen() {
  const {
    state: { meet },
  } = useMeet();
  const [eventId, setEventId] = useState(
    () =>
      meet.events.find((e) => eventProgress(meet, e.id).verified > 0)?.id ??
      meet.events[0]?.id ??
      "",
  );
  const index = useMemo(() => indexMeet(meet), [meet]);
  const event = index.event(eventId);
  const rows = useMemo(
    () => (event ? eventStandings(meet, event.id) : []),
    [meet, event],
  );
  const scores = useMemo(() => teamScores(meet), [meet]);
  const progress = event ? eventProgress(meet, event.id) : null;
  const scoring = meet.scoring.preset !== "none";
  const diving = event?.kind === "dive";

  return (
    <div className="flex h-full">
      <EventList
        meet={meet}
        selected={eventId}
        onSelect={setEventId}
        badge={(id) => {
          const p = eventProgress(meet, id);
          return p.heats ? `${p.verified}/${p.heats}` : "";
        }}
      />
      <div className="min-w-0 flex-1 overflow-auto p-6">
        {event ? (
          <div className="flex flex-col gap-4">
            <header className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">
                Event {event.number} · {eventTitle(event)}
              </h1>
              {progress?.state === "complete" ? (
                <Badge>Official</Badge>
              ) : progress && progress.verified > 0 ? (
                <Badge variant="secondary">
                  Unofficial · {progress.verified} of {progress.heats} heats
                </Badge>
              ) : null}
              <div className="ml-auto flex items-start gap-2">
                <PrintButton kind="results">All results</PrintButton>
                <PrintButton
                  kind="results"
                  eventIds={[event.id]}
                  suffix={`Event ${event.number}`}
                >
                  This event
                </PrintButton>
              </div>
            </header>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No verified heats yet.
              </p>
            ) : (
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Place</TableHead>
                      <TableHead>
                        {event.isRelay ? "Relay" : diving ? "Diver" : "Swimmer"}
                      </TableHead>
                      <TableHead className="w-20">Team</TableHead>
                      {diving ? null : (
                        <TableHead className="w-24 text-right">Seed</TableHead>
                      )}
                      <TableHead className="w-24 text-right">
                        {diving ? "Score" : "Time"}
                      </TableHead>
                      <TableHead className="w-24">
                        {diving ? "Order" : "Heat/Lane"}
                      </TableHead>
                      {scoring ? (
                        <TableHead className="w-16 text-right">
                          Points
                        </TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.entry.id}>
                        <TableCell className="font-mono tabular-nums">
                          {row.place ??
                            (row.entry.exhibition && row.result.status === "ok"
                              ? "X"
                              : "")}
                        </TableCell>
                        <TableCell>{index.entryLabel(row.entry)}</TableCell>
                        <TableCell className="font-mono">
                          {row.entry.teamCode}
                        </TableCell>
                        {diving ? null : (
                          <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                            {displayTime(row.entry.seedTimeMs)}
                          </TableCell>
                        )}
                        <TableCell className="text-right font-mono tabular-nums">
                          {row.result.status === "ok"
                            ? markLabel(row.result)
                            : row.result.status.toUpperCase()}
                          {row.result.status === "dq" && row.result.dqCode ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              {row.result.dqCode}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                          {diving
                            ? row.result.lane
                            : `${finalLabel(event, row.result.heat) ?? row.result.heat}/${row.result.lane}`}
                        </TableCell>
                        {scoring ? (
                          <TableCell className="text-right font-mono tabular-nums">
                            {row.points || ""}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No events.</p>
        )}
      </div>
      {scoring ? (
        <aside className="w-60 shrink-0 overflow-auto border-l p-4">
          <h2 className="mb-2 text-sm font-semibold">Team scores</h2>
          <ol className="flex flex-col gap-1">
            {scores.map((s, i) => (
              <li key={s.teamCode} className="flex items-center gap-2 text-sm">
                <span className="w-5 font-mono text-xs text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <span className="flex-1 truncate">
                  {index.teamName(s.teamCode)}
                </span>
                <span className="font-mono tabular-nums">{s.points}</span>
              </li>
            ))}
          </ol>
        </aside>
      ) : null}
    </div>
  );
}
