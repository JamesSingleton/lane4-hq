"use client";

import {
  checkMeetEntryCounts,
  checkQualifyingTime,
  isRelayStroke,
  type MeetEntryLimits,
} from "@lane4hq/swim-core/entry-limits";
import { formatEventName, formatGenderShort } from "@lane4hq/swim-core/events";
import {
  deriveRelayLetter,
  formatAssignmentCountLine,
  isRelayAlternateSlot,
  racingRelayCount,
  relayLegRoleLabel,
} from "@lane4hq/swim-core/relay-legs";
import { formatTime } from "@lane4hq/swim-core/times";
import { Badge } from "@lane4hq/ui/components/badge";
import { Button } from "@lane4hq/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lane4hq/ui/components/card";
import { Label } from "@lane4hq/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lane4hq/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lane4hq/ui/components/table";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";
import { updateMeetEntryStatusAction } from "../actions";

type MatrixEvent = {
  id: string;
  eventNumber: number | null;
  distance: number;
  stroke: string;
  gender: string;
  eventKey?: string;
  qualifyingTimeMs?: number | null;
};

type MatrixSwimmer = {
  membershipId: string;
  firstName: string;
  lastName: string;
};

type MatrixEntry = {
  id: string;
  meetEventId: string;
  membershipId: string;
  status: string;
  seedTimeMs?: number | null;
  exhibition?: boolean;
  kind?: "individual" | "relay";
  relayLetter?: string;
  legOrder?: number;
  legStroke?: string | null;
};

type MatrixRelayLeg = {
  id: string;
  meetEventId: string;
  membershipId: string;
  relayLetter: string;
  legOrder: number;
  stroke: string | null;
};

type GroupBy = "swimmer" | "event" | "errors";

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "swimmer", label: "Swimmer" },
  { value: "event", label: "Event" },
  { value: "errors", label: "Validation" },
];

function isGroupBy(value: string): value is GroupBy {
  return value === "swimmer" || value === "event" || value === "errors";
}

function swimmerSortName(swimmer: MatrixSwimmer | undefined) {
  if (!swimmer) return "";
  return `${swimmer.lastName} ${swimmer.firstName}`;
}

function seedTimeSortValue(ms: number | null | undefined) {
  if (ms == null || ms <= 0) return Number.POSITIVE_INFINITY;
  return ms;
}

function compareEventGroupRows(
  a: MatrixEntry,
  b: MatrixEntry,
  event: MatrixEvent,
  swimmerById: Map<string, MatrixSwimmer>,
) {
  const nameCmp = swimmerSortName(
    swimmerById.get(a.membershipId),
  ).localeCompare(swimmerSortName(swimmerById.get(b.membershipId)));

  if (isRelayStroke(event.stroke, event.eventKey)) {
    const letter = (a.relayLetter ?? "").localeCompare(b.relayLetter ?? "");
    if (letter !== 0) return letter;
    const order =
      (a.legOrder ?? Number.MAX_SAFE_INTEGER) -
      (b.legOrder ?? Number.MAX_SAFE_INTEGER);
    if (order !== 0) return order;
    return nameCmp;
  }

  const time =
    seedTimeSortValue(a.seedTimeMs) - seedTimeSortValue(b.seedTimeMs);
  if (time !== 0) return time;
  return nameCmp;
}

function relayRoleExtra(event: MatrixEvent, entry: MatrixEntry) {
  if (entry.kind !== "relay" || !entry.relayLetter) return undefined;
  return {
    letter: entry.relayLetter,
    slot: relayLegRoleLabel(event.stroke, entry.legOrder ?? 1),
  };
}

function swimmerAssignmentCountLabel(
  membershipId: string,
  rows: MatrixEntry[],
) {
  const individual = rows.filter((row) => row.kind !== "relay").length;
  const relayInputs = rows.flatMap((row) =>
    row.kind === "relay"
      ? [
          {
            membershipId: row.membershipId,
            meetEventId: row.meetEventId,
            relayLetter: row.relayLetter,
            legOrder: row.legOrder ?? 0,
          },
        ]
      : [],
  );
  const racing = racingRelayCount(relayInputs, membershipId);
  const alts = rows.filter(
    (row) => row.kind === "relay" && isRelayAlternateSlot(row.legOrder ?? 0),
  ).length;
  return formatAssignmentCountLine(individual + racing, alts);
}

function eventLabel(
  event: MatrixEvent,
  extra?: { letter?: string; slot?: string },
) {
  const gender = formatGenderShort(event.gender);
  const base =
    `#${event.eventNumber ?? "—"} ${gender ? `${gender} ` : ""}${formatEventName(event.distance, event.stroke)}`.trim();
  if (extra?.letter && extra.slot) {
    return `${base} · ${extra.letter} · ${extra.slot}`;
  }
  return base;
}

function statusBadge(status: string) {
  if (status === "approved") {
    return (
      <Badge
        variant="secondary"
        className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      >
        Approved
      </Badge>
    );
  }
  if (status === "draft") {
    return (
      <Badge
        variant="secondary"
        className="bg-amber-500/15 text-amber-700 dark:text-amber-400"
      >
        Draft
      </Badge>
    );
  }
  if (status === "lineup") {
    return <Badge variant="outline">Lineup</Badge>;
  }
  if (status === "scratched") {
    return (
      <Badge variant="destructive" className="line-through">
        Scratched
      </Badge>
    );
  }
  return <Badge variant="outline">{status}</Badge>;
}

export function EntryMatrix({
  teamId,
  meetId,
  events,
  swimmers,
  entries,
  relayLegs = [],
  limits,
  pendingMembershipIds = [],
}: {
  teamId: string;
  meetId: string;
  events: MatrixEvent[];
  swimmers: MatrixSwimmer[];
  entries: MatrixEntry[];
  relayLegs?: MatrixRelayLeg[];
  limits?: MeetEntryLimits | null;
  pendingMembershipIds?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("swimmer");

  const pendingIds = useMemo(
    () => new Set(pendingMembershipIds),
    [pendingMembershipIds],
  );

  const eventById = useMemo(
    () => new Map(events.map((event) => [event.id, event])),
    [events],
  );

  const swimmerById = useMemo(
    () => new Map(swimmers.map((swimmer) => [swimmer.membershipId, swimmer])),
    [swimmers],
  );

  const draftEntries = useMemo(
    () => entries.filter((e) => e.status === "draft"),
    [entries],
  );

  const activeEntries = useMemo(() => {
    const individuals = entries
      .filter((e) => e.status !== "scratched")
      .map((e) => ({ ...e, kind: "individual" as const }));
    const relays: MatrixEntry[] = relayLegs.map((leg) => ({
      id: leg.id,
      meetEventId: leg.meetEventId,
      membershipId: leg.membershipId,
      status: "lineup",
      kind: "relay",
      relayLetter: deriveRelayLetter(leg.relayLetter, leg.legOrder),
      legOrder: leg.legOrder,
      legStroke: leg.stroke,
    }));
    return [...individuals, ...relays];
  }, [entries, relayLegs]);

  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) => {
        const an = a.eventNumber ?? Number.MAX_SAFE_INTEGER;
        const bn = b.eventNumber ?? Number.MAX_SAFE_INTEGER;
        return an - bn;
      }),
    [events],
  );

  const groups = useMemo(() => {
    if (groupBy === "swimmer") {
      const byMembership = new Map<string, MatrixEntry[]>();
      for (const entry of activeEntries) {
        const list = byMembership.get(entry.membershipId) ?? [];
        list.push(entry);
        byMembership.set(entry.membershipId, list);
      }

      return swimmers
        .map((swimmer) => {
          const rows = [...(byMembership.get(swimmer.membershipId) ?? [])].sort(
            (a: MatrixEntry, b: MatrixEntry) => {
              const ea = eventById.get(a.meetEventId);
              const eb = eventById.get(b.meetEventId);
              const an = ea?.eventNumber ?? Number.MAX_SAFE_INTEGER;
              const bn = eb?.eventNumber ?? Number.MAX_SAFE_INTEGER;
              return an - bn;
            },
          );
          return {
            key: swimmer.membershipId,
            label: `${swimmer.firstName} ${swimmer.lastName}`,
            countLabel: swimmerAssignmentCountLabel(swimmer.membershipId, rows),
            rows,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
    }

    if (groupBy === "errors") {
      const qtMiss: MatrixEntry[] = [];
      const overLimit: MatrixEntry[] = [];
      const pendingCommitment: MatrixEntry[] = [];
      const countInputs = relayLegs.map((leg) => ({
        membershipId: leg.membershipId,
        meetEventId: leg.meetEventId,
        relayLetter: deriveRelayLetter(leg.relayLetter, leg.legOrder),
        legOrder: leg.legOrder,
      }));

      for (const entry of activeEntries) {
        if (pendingIds.has(entry.membershipId)) {
          pendingCommitment.push(entry);
        }
        if (entry.kind === "relay") continue;
        const event = eventById.get(entry.meetEventId);
        const qt = checkQualifyingTime(
          event?.qualifyingTimeMs,
          entry.seedTimeMs,
        );
        if (!qt.ok) qtMiss.push(entry);
      }

      const members = new Set(activeEntries.map((e) => e.membershipId));
      for (const membershipId of members) {
        const individual = activeEntries.filter(
          (e) => e.membershipId === membershipId && e.kind !== "relay",
        ).length;
        const relay = racingRelayCount(countInputs, membershipId);
        const check = checkMeetEntryCounts(limits, { individual, relay });
        if (check.ok) continue;
        for (const entry of activeEntries) {
          if (entry.membershipId !== membershipId) continue;
          if (
            entry.kind === "relay" &&
            isRelayAlternateSlot(entry.legOrder ?? 0)
          ) {
            continue;
          }
          overLimit.push(entry);
        }
      }

      return [
        {
          key: "pending",
          label: "Pending commitment (excluded from export)",
          rows: pendingCommitment,
        },
        { key: "qt", label: "Slower than QT", rows: qtMiss },
        { key: "limit", label: "Over entry limit", rows: overLimit },
      ]
        .filter((group) => group.rows.length > 0)
        .map((group) => ({
          ...group,
          countLabel: String(group.rows.length),
        }));
    }

    const byEvent = new Map<string, MatrixEntry[]>();
    for (const entry of activeEntries) {
      const list = byEvent.get(entry.meetEventId) ?? [];
      list.push(entry);
      byEvent.set(entry.meetEventId, list);
    }

    return sortedEvents
      .map((event) => {
        const rows = [...(byEvent.get(event.id) ?? [])].sort(
          (a: MatrixEntry, b: MatrixEntry) =>
            compareEventGroupRows(a, b, event, swimmerById),
        );
        return {
          key: event.id,
          label: eventLabel(event),
          countLabel: String(rows.length),
          rows,
        };
      })
      .filter((group) => group.rows.length > 0);
  }, [
    groupBy,
    swimmers,
    sortedEvents,
    activeEntries,
    eventById,
    swimmerById,
    limits,
    relayLegs,
    pendingIds,
  ]);

  function approveDrafts() {
    if (draftEntries.length === 0) return;
    setError("");
    startTransition(async () => {
      try {
        const results = await Promise.all(
          draftEntries.map((entry) =>
            updateMeetEntryStatusAction(teamId, meetId, entry.id, "approved"),
          ),
        );
        const failed = results.find((result) => !result.ok);
        if (failed && !failed.ok) {
          setError(failed.message);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to approve drafts",
        );
      }
    });
  }

  if (swimmers.length === 0 || events.length === 0) {
    return null;
  }

  const showEventColumn = groupBy !== "event";
  const showSwimmerColumn = groupBy !== "swimmer";
  const showSeedColumn = groupBy === "event";
  const columnCount =
    (showSwimmerColumn ? 1 : 0) +
    (showEventColumn ? 1 : 0) +
    (showSeedColumn ? 1 : 0) +
    1;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Entries</CardTitle>
          <CardDescription>
            Swimmers with entries and their events. Group by swimmer, event, or
            validation (QT warnings, pending commitment, and entry-limit
            errors).
          </CardDescription>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={pending || draftEntries.length === 0}
          onClick={approveDrafts}
        >
          {pending
            ? "Approving…"
            : `Approve drafts${draftEntries.length > 0 ? ` (${draftEntries.length})` : ""}`}
        </Button>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entry-group-by">Group by</Label>
            <Select
              items={GROUP_BY_OPTIONS}
              value={groupBy}
              onValueChange={(value) => {
                if (value != null && isGroupBy(value)) setGroupBy(value);
              }}
            >
              <SelectTrigger id="entry-group-by" className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {GROUP_BY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {groupBy === "event" && activeEntries.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No entries yet. Select a swimmer and add events from the board
            above.
          </p>
        ) : groupBy === "errors" && groups.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No QT warnings or entry-limit errors on the current lineup.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {showSwimmerColumn ? <TableHead>Swimmer</TableHead> : null}
                {showEventColumn ? <TableHead>Event</TableHead> : null}
                {showSeedColumn ? <TableHead>Seed</TableHead> : null}
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <Fragment key={group.key}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={columnCount} className="py-3.5">
                      <span className="text-xl font-semibold tracking-tight">
                        {group.label}
                      </span>
                      <span className="text-muted-foreground ml-2 text-sm font-normal">
                        {group.countLabel}
                      </span>
                    </TableCell>
                  </TableRow>
                  {group.rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={columnCount}
                        className="text-muted-foreground text-sm"
                      >
                        No events entered
                      </TableCell>
                    </TableRow>
                  ) : (
                    group.rows.map((entry) => {
                      const event = eventById.get(entry.meetEventId);
                      const swimmer = swimmerById.get(entry.membershipId);
                      return (
                        <TableRow key={entry.id}>
                          {showSwimmerColumn ? (
                            <TableCell>
                              {swimmer
                                ? `${swimmer.firstName} ${swimmer.lastName}`
                                : "—"}
                            </TableCell>
                          ) : null}
                          {showEventColumn ? (
                            <TableCell>
                              {event
                                ? eventLabel(
                                    event,
                                    relayRoleExtra(event, entry),
                                  )
                                : "—"}
                            </TableCell>
                          ) : null}
                          {showSeedColumn ? (
                            <TableCell className="tabular-nums">
                              {entry.kind === "relay"
                                ? `${entry.relayLetter ?? "A"} · ${relayLegRoleLabel(
                                    event?.stroke ?? "",
                                    entry.legOrder ?? 1,
                                  )}`
                                : formatTime(entry.seedTimeMs ?? 0)}
                            </TableCell>
                          ) : null}
                          <TableCell>{statusBadge(entry.status)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
