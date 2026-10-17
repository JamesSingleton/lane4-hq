import {
  DIVE_JUDGE_PANELS,
  diveSettings,
  setDiveSettings,
} from "@lane4hq/meet-engine/diving";
import { scratchEntry } from "@lane4hq/meet-engine/entries";
import {
  displayTime,
  eventTitle,
  finalLabel,
  indexMeet,
} from "@lane4hq/meet-engine/labels";
import {
  type DiveJudges,
  heatKey,
  type MeetEvent,
} from "@lane4hq/meet-engine/model";
import {
  eventHasResults,
  heatsForEvent,
  moveEntry,
  seedEvent,
} from "@lane4hq/meet-engine/seeding";
import { eventProgress } from "@lane4hq/meet-engine/standings";
import { Badge } from "@lane4hq/ui/components/badge";
import { Button } from "@lane4hq/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lane4hq/ui/components/table";
import { cn } from "@lane4hq/ui/lib/utils";
import { ListRestart, Undo2, UserX } from "lucide-react";
import { useMemo, useState } from "react";
import { EventList } from "../components/event-list";
import { FinalsPanel } from "../components/finals-panel";
import { NativeSelect } from "../components/native-select";
import { PrintButton } from "../components/print-button";
import { errorMessage } from "../lib/native";
import { useMeet } from "../state/meet-context";

export function HeatsScreen() {
  const {
    state: { meet },
    actions: { update },
  } = useMeet();
  const [eventId, setEventId] = useState(meet.events[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const index = useMemo(() => indexMeet(meet), [meet]);
  const event = index.event(eventId);
  const heats = event ? heatsForEvent(meet, event.id) : [];
  const locked = event ? eventHasResults(meet, event.id) : true;
  const isDive = event?.kind === "dive";

  const seatedIds = new Set(
    heats.flatMap((h) => h.lanes.map((l) => l.entryId)),
  );
  const unseated = meet.entries.filter(
    (e) => e.eventId === eventId && !seatedIds.has(e.id),
  );

  function act(fn: () => void) {
    try {
      setError(null);
      fn();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex h-full">
      <EventList
        meet={meet}
        selected={eventId}
        onSelect={setEventId}
        badge={(id) => {
          const p = eventProgress(meet, id);
          return p.heats ? `${p.heats}` : "—";
        }}
      />
      <div className="min-w-0 flex-1 overflow-auto">
        {event ? (
          <div className="flex flex-col gap-4 p-6">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="text-lg font-semibold tracking-tight">
                  Event {event.number} · {eventTitle(event)}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {seedingNote(event)}
                  {locked ? " · has results, seeding is locked" : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <PrintButton kind="heat-sheet">Heat sheet</PrintButton>
                <PrintButton
                  kind="heat-sheet"
                  eventIds={[event.id]}
                  suffix={`Event ${event.number}`}
                >
                  This event
                </PrintButton>
                {event.round === "final" ? null : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={locked}
                    onClick={() =>
                      act(() => update((m) => seedEvent(m, event.id)))
                    }
                  >
                    <ListRestart />
                    {isDive
                      ? heats.length
                        ? "Redraw order"
                        : "Draw order"
                      : heats.length
                        ? "Reseed"
                        : "Seed"}
                  </Button>
                )}
              </div>
            </header>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {isDive && !locked ? (
              <DiveSettings
                eventId={event.id}
                onChange={(patch) =>
                  act(() => update((m) => setDiveSettings(m, event.id, patch)))
                }
              />
            ) : null}
            {event.round === "prelim" ? (
              <FinalsPanel key={event.id} prelim={event} onBuilt={setEventId} />
            ) : null}

            {heats.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not seeded yet.{" "}
                {meet.entries.some((e) => e.eventId === event.id)
                  ? "Seed it to build heats."
                  : "No entries."}
              </p>
            ) : null}

            {heats.map((heat) => {
              const verified = meet.heatRecords[heatKey(event.id, heat.number)];
              const byLane = new Map(
                heat.lanes.map((l) => [l.lane, l.entryId]),
              );
              const rowLanes = isDive
                ? heat.lanes.map((l) => l.lane)
                : Array.from({ length: meet.poolLanes }, (_, i) => i + 1);
              return (
                <section key={heat.number} className="rounded-xl border">
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <h2 className="text-sm font-semibold">
                      {isDive
                        ? "Dive order"
                        : (finalLabel(event, heat.number) ??
                          `Heat ${heat.number} of ${heats.length}`)}
                    </h2>
                    {verified ? <Badge>Verified</Badge> : null}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">
                          {isDive ? "Order" : "Lane"}
                        </TableHead>
                        <TableHead>
                          {event.isRelay
                            ? "Relay"
                            : isDive
                              ? "Diver"
                              : "Swimmer"}
                        </TableHead>
                        <TableHead className="w-20">Team</TableHead>
                        <TableHead className="w-24 text-right">Seed</TableHead>
                        <TableHead className="w-44" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rowLanes.map((lane) => {
                        const entryId = byLane.get(lane);
                        const entry = entryId
                          ? index.entry(entryId)
                          : undefined;
                        return (
                          <TableRow
                            key={lane}
                            className={cn(!entry && "text-muted-foreground")}
                          >
                            <TableCell className="font-mono tabular-nums">
                              {lane}
                            </TableCell>
                            <TableCell>
                              {entry ? (
                                <span
                                  className={cn(
                                    entry.scratched && "line-through",
                                  )}
                                >
                                  {index.entryLabel(entry)}
                                  {entry.exhibition ? (
                                    <span className="ml-1 text-xs text-muted-foreground">
                                      (X)
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="font-mono">
                              {entry?.teamCode ?? ""}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {entry && !isDive
                                ? displayTime(entry.seedTimeMs)
                                : ""}
                            </TableCell>
                            <TableCell>
                              {entry && !locked ? (
                                <div className="flex items-center justify-end gap-1">
                                  <MoveSelect
                                    heats={heats.length}
                                    lanes={
                                      isDive
                                        ? heat.lanes.length
                                        : meet.poolLanes
                                    }
                                    diveOrder={isDive}
                                    current={{ heat: heat.number, lane }}
                                    onMove={(to) =>
                                      act(() =>
                                        update((m) =>
                                          moveEntry(m, entry.id, to),
                                        ),
                                      )
                                    }
                                  />
                                  <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    aria-label={
                                      entry.scratched ? "Unscratch" : "Scratch"
                                    }
                                    onClick={() =>
                                      update((m) =>
                                        scratchEntry(
                                          m,
                                          entry.id,
                                          !entry.scratched,
                                        ),
                                      )
                                    }
                                  >
                                    {entry.scratched ? <Undo2 /> : <UserX />}
                                  </Button>
                                </div>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </section>
              );
            })}

            {unseated.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold">
                  Not in a heat ({unseated.length})
                </h2>
                <div className="flex flex-wrap gap-2">
                  {unseated.map((entry) => (
                    <Badge
                      key={entry.id}
                      variant="outline"
                      className={cn(entry.scratched && "line-through")}
                    >
                      {index.entryLabel(entry)} · {entry.teamCode} ·{" "}
                      {displayTime(entry.seedTimeMs)}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Scratched swimmers stay out of heats. Reseed to place late
                  entries.
                </p>
              </section>
            ) : null}
          </div>
        ) : (
          <p className="p-6 text-sm text-muted-foreground">
            Add events in Setup first.
          </p>
        )}
      </div>
    </div>
  );
}

function seedingNote(event: MeetEvent): string {
  if (event.kind === "dive") return "Diving, one flight in drawn order";
  if (event.round === "prelim") return "Prelims, top heats circle-seeded";
  if (event.round === "final")
    return "Finals from prelim results, A final swims last";
  return "Timed finals, fastest heat last";
}

function DiveSettings({
  eventId,
  onChange,
}: {
  eventId: string;
  onChange: (patch: { diveCount?: number; diveJudges?: DiveJudges }) => void;
}) {
  const {
    state: { meet },
  } = useMeet();
  const { diveCount, diveJudges } = diveSettings(meet, eventId);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <NativeSelect
        aria-label="Dives per diver"
        className="w-32"
        value={String(diveCount)}
        onChange={(e) => onChange({ diveCount: Number(e.currentTarget.value) })}
      >
        {Array.from({ length: 11 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n} {n === 1 ? "dive" : "dives"}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Judges"
        className="w-32"
        value={String(diveJudges)}
        onChange={(e) =>
          onChange({ diveJudges: Number(e.currentTarget.value) as DiveJudges })
        }
      >
        {DIVE_JUDGE_PANELS.map((n) => (
          <option key={n} value={n}>
            {n} judges
          </option>
        ))}
      </NativeSelect>
      <span className="text-muted-foreground">
        High school duals: 6 dives, 3 judges. Championships: 11 dives, 5 or 7.
      </span>
    </div>
  );
}

function MoveSelect({
  heats,
  lanes,
  diveOrder,
  current,
  onMove,
}: {
  heats: number;
  lanes: number;
  /** Reorder a dive flight instead of moving between heats and lanes. */
  diveOrder: boolean;
  current: { heat: number; lane: number };
  onMove: (to: { heat: number; lane: number }) => void;
}) {
  const options: Array<{ heat: number; lane: number }> = [];
  for (let h = 1; h <= (diveOrder ? 1 : heats + 1); h++) {
    for (let l = 1; l <= lanes; l++) options.push({ heat: h, lane: l });
  }
  return (
    <NativeSelect
      aria-label="Move to heat and lane"
      className="w-32"
      value=""
      onChange={(e) => {
        const [heat, lane] = e.currentTarget.value.split(":").map(Number);
        if (heat && lane) onMove({ heat, lane });
      }}
    >
      <option value="">Move to…</option>
      {options
        .filter((o) => o.heat !== current.heat || o.lane !== current.lane)
        .map((o) => (
          <option key={`${o.heat}:${o.lane}`} value={`${o.heat}:${o.lane}`}>
            {diveOrder
              ? `Order ${o.lane}`
              : `${o.heat > heats ? "New heat" : `Heat ${o.heat}`}, lane ${o.lane}`}
          </option>
        ))}
    </NativeSelect>
  );
}
