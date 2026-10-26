"use client";

import { swimmerAgeOnDate } from "@lane4hq/swim-core/age";
import { formatDateOnlyLabel } from "@lane4hq/swim-core/calendar-date";
import { isRelayStroke } from "@lane4hq/swim-core/entry-limits";
import { formatEventName, formatGenderShort } from "@lane4hq/swim-core/events";
import {
  formatResultMark,
  formatTime,
  formatTypedSwimTime,
} from "@lane4hq/swim-core/times";
import { Badge } from "@lane4hq/ui/components/badge";
import { Button } from "@lane4hq/ui/components/button";
import { Input } from "@lane4hq/ui/components/input";
import { Label } from "@lane4hq/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lane4hq/ui/components/select";
import { Switch } from "@lane4hq/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lane4hq/ui/components/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lane4hq/ui/components/tooltip";
import { cn } from "@lane4hq/ui/lib/utils";
import {
  BanIcon,
  PlusIcon,
  RabbitIcon,
  TargetIcon,
  TurtleIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addRelayResultSplitAction } from "../../actions";
import { getTimeStandardCutsAction } from "../../time-standards-actions";
import type {
  RelayLineupPrefill,
  ResultEventOption,
  ResultSwimmerOption,
} from "../add-result-form";
import { AddResultForm } from "../add-result-form";

export type ResultRow = {
  id: string;
  meetEventId: string;
  swimmerId: string;
  timeMs: number;
  previousBestTimeMs: number | null;
  place: number | null;
  isDq: boolean;
  round: "prelim" | "swimoff" | "finals" | null;
  heat: number | null;
  lane: number | null;
  exhibition: boolean;
  dqCode: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | string | null;
  eventNumber: number | null;
  distance: number;
  stroke: string;
  gender: string;
  ageGroup: string | null;
  eventKey: string;
  note?: string;
};

export type RelayAttemptSplit = {
  id: string;
  resultId: string;
  membershipId: string;
  swimmerId: string;
  firstName: string;
  lastName: string;
  gender: "male" | "female";
  legOrder: number;
  timeMs: number;
};

export type RelayAttemptMember = {
  id: string;
  resultId: string;
  membershipId: string;
  swimmerId: string;
  firstName: string;
  lastName: string;
  legOrder: number;
};

export type RelayAttempt = {
  id: string;
  meetEventId: string;
  relayLetter: string;
  round: ResultRow["round"];
  timeMs: number;
  heat: number | null;
  lane: number | null;
  exhibition: boolean;
  isDq: boolean;
  dqCode: string | null;
  eventNumber: number | null;
  distance: number;
  stroke: string;
  gender: string;
  ageGroup: string | null;
  eventKey: string;
  members: RelayAttemptMember[];
  splits: RelayAttemptSplit[];
};

type StandardSetOption = {
  id: string;
  name: string;
  course: string;
  seasonLabel: string | null;
};

type StandardCut = {
  eventKey: string;
  gender: string;
  ageGroup: string;
  timeMs: number;
};

type GroupMode = "event" | "swimmer";
type RoundFilter = "all" | "prelim" | "swimoff" | "finals";

function eventLabel(row: ResultRow) {
  const gender = formatGenderShort(row.gender);
  return `#${row.eventNumber ?? "—"} ${gender} ${formatEventName(row.distance, row.stroke)}`.replace(
    /\s+/g,
    " ",
  );
}

function isPersonalBest(row: ResultRow) {
  if (row.isDq || row.timeMs <= 0) return false;
  return (
    row.previousBestTimeMs == null ||
    row.previousBestTimeMs <= 0 ||
    row.timeMs < row.previousBestTimeMs
  );
}

/** Seconds delta: negative = faster (drop). */
function improvementSeconds(row: ResultRow): number | null {
  if (
    row.isDq ||
    row.previousBestTimeMs == null ||
    row.previousBestTimeMs <= 0 ||
    row.timeMs <= 0
  ) {
    return null;
  }
  return (row.timeMs - row.previousBestTimeMs) / 1000;
}

function formatImprovement(
  deltaSec: number | null,
  showPercent: boolean,
  previousBestTimeMs: number | null,
): string {
  if (deltaSec == null) return "—";
  const sign = deltaSec > 0 ? "+" : "";
  const seconds = `${sign}${deltaSec.toFixed(2)}s`;
  if (showPercent && previousBestTimeMs != null && previousBestTimeMs > 0) {
    const pct = (deltaSec * 1000 * 100) / previousBestTimeMs;
    const pctSign = pct > 0 ? "+" : "";
    return `${seconds} (${pctSign}${pct.toFixed(1)}%)`;
  }
  return seconds;
}

function ageGroupCandidates(
  age: number | null,
  eventAgeGroup: string | null,
): string[] {
  const out: string[] = [];
  if (eventAgeGroup) out.push(eventAgeGroup);
  if (age == null) {
    out.push("Open", "Senior");
    return out;
  }
  if (age <= 8) out.push("8&U", "8 & Under", "10&U");
  else if (age <= 10) out.push("10&U", "10 & Under", "9-10", "8-10");
  else if (age <= 12) out.push("11-12", "12&U");
  else if (age <= 14) out.push("13-14", "14&U");
  else if (age <= 16) out.push("15-16", "16&U");
  else if (age <= 18) out.push("17-18", "18&U", "15-18");
  out.push("Open", "Senior", "Open/Senior");
  return out;
}

function findCutTime(
  cuts: StandardCut[],
  row: ResultRow,
  meetStartDate: Date,
): number | null {
  if (cuts.length === 0) return null;
  const age = swimmerAgeOnDate(row.dateOfBirth, meetStartDate);
  const candidates = ageGroupCandidates(age, row.ageGroup);
  const genderNorm =
    row.gender === "f" || row.gender === "female"
      ? "female"
      : row.gender === "x" || row.gender === "mixed"
        ? "mixed"
        : "male";

  for (const ageGroup of candidates) {
    const match = cuts.find(
      (c) =>
        c.eventKey === row.eventKey &&
        c.gender === genderNorm &&
        c.ageGroup.toLowerCase() === ageGroup.toLowerCase(),
    );
    if (match) return match.timeMs;
  }

  // Fallback: same eventKey + gender, any age group labeled open/senior
  const open = cuts.find(
    (c) =>
      c.eventKey === row.eventKey &&
      c.gender === genderNorm &&
      /open|senior/i.test(c.ageGroup),
  );
  return open?.timeMs ?? null;
}

/** Swim times: lower is faster. */
type StandardCompare = "faster" | "equal" | "slower";

function compareToStandard(
  timeMs: number,
  cutMs: number,
  isDq: boolean,
): StandardCompare | null {
  if (isDq || timeMs <= 0 || cutMs <= 0) return null;
  if (timeMs < cutMs) return "faster";
  if (timeMs === cutMs) return "equal";
  return "slower";
}

const ROUND_LABEL: Record<string, string> = {
  prelim: "Prelim",
  swimoff: "Swim-off",
  finals: "Finals",
};

const ROUND_SORT: Record<string, number> = {
  prelim: 0,
  swimoff: 1,
  finals: 2,
};

function roundSortKey(round: ResultRow["round"]) {
  if (!round) return 3;
  return ROUND_SORT[round] ?? 3;
}

function compareResultRows(a: ResultRow, b: ResultRow) {
  const roundDiff = roundSortKey(a.round) - roundSortKey(b.round);
  if (roundDiff !== 0) return roundDiff;
  if (a.place != null && b.place != null) return a.place - b.place;
  if (a.place != null) return -1;
  if (b.place != null) return 1;
  return a.timeMs - b.timeMs;
}

function relayEventLabel(attempt: RelayAttempt) {
  const gender = formatGenderShort(attempt.gender);
  return `#${attempt.eventNumber ?? "—"} ${gender} ${formatEventName(attempt.distance, attempt.stroke)}`.replace(
    /\s+/g,
    " ",
  );
}

function relayAttemptLabel(attempt: RelayAttempt) {
  return `${relayEventLabel(attempt)} ${attempt.relayLetter}`;
}

function RelaySplitCell({
  attempt,
  member,
  split,
  teamId,
  meetId,
}: {
  attempt: RelayAttempt;
  member: RelayAttemptMember;
  split: RelayAttemptSplit | undefined;
  teamId: string;
  meetId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const [isPending, startTransition] = useTransition();

  function save() {
    const splitTime = value.trim();
    if (!splitTime) {
      setEditing(false);
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        await addRelayResultSplitAction(teamId, meetId, {
          resultId: attempt.id,
          legOrder: member.legOrder,
          splitTime,
        });
        setEditing(false);
        router.refresh();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not save the split.",
        );
      } finally {
        savingRef.current = false;
      }
    });
  }

  if (split) {
    return (
      <span className="font-timing tabular-nums">
        {formatTime(split.timeMs)}
      </span>
    );
  }

  if (!editing) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        No split recorded
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Add hand-timed split for ${member.firstName} ${member.lastName}, leg ${member.legOrder}`}
                onClick={() => setEditing(true)}
              />
            }
          >
            <PlusIcon aria-hidden />
          </TooltipTrigger>
          <TooltipContent>Add hand-timed split</TooltipContent>
        </Tooltip>
      </span>
    );
  }

  return (
    <div className="flex min-w-32 flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <Input
          name={`relay-split-${member.id}`}
          value={value}
          onChange={(event) =>
            setValue(formatTypedSwimTime(event.target.value))
          }
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              setValue("");
              setError(null);
              setEditing(false);
            }
          }}
          aria-label={`Hand-timed split for ${member.firstName} ${member.lastName}, leg ${member.legOrder}`}
          autoComplete="off"
          inputMode="decimal"
          placeholder="24.19…"
          className="h-7 w-20 font-timing tabular-nums"
          disabled={isPending}
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Cancel split for ${member.firstName} ${member.lastName}, leg ${member.legOrder}`}
                disabled={isPending}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setValue("");
                  setError(null);
                  setEditing(false);
                }}
              />
            }
          >
            <BanIcon aria-hidden />
          </TooltipTrigger>
          <TooltipContent>Cancel split</TooltipContent>
        </Tooltip>
      </div>
      {error ? (
        <span
          className="text-destructive max-w-44 text-right text-xs"
          aria-live="polite"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}

function RelayResultCard({
  attempt,
  teamId,
  meetId,
}: {
  attempt: RelayAttempt;
  teamId: string;
  meetId: string;
}) {
  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <div className="border-border bg-muted/30 flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">
            {relayAttemptLabel(attempt)}
          </h3>
          <p className="text-muted-foreground text-xs">
            {attempt.round
              ? `${ROUND_LABEL[attempt.round] ?? attempt.round} · `
              : null}
            Team time
          </p>
        </div>
        <p
          className={cn(
            "font-timing text-lg tabular-nums",
            attempt.isDq && "text-destructive line-through",
          )}
        >
          {formatResultMark(attempt.timeMs, attempt.isDq, attempt.dqCode)}
        </p>
      </div>
      {attempt.members.length > 0 ? (
        <ul className="divide-border divide-y px-4 py-2 text-sm">
          {attempt.members.map((member) => {
            const split = attempt.splits.find(
              (item) => item.legOrder === member.legOrder,
            );
            return (
              <li
                key={member.id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-1.5"
              >
                <span>
                  {member.firstName} {member.lastName}
                  <span className="text-muted-foreground ml-2 text-xs">
                    Leg {member.legOrder}
                    {member.legOrder === 1 ? " · lead-off" : ""}
                  </span>
                </span>
                <RelaySplitCell
                  attempt={attempt}
                  member={member}
                  split={split}
                  teamId={teamId}
                  meetId={meetId}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground px-4 py-3 text-sm">
          No saved lineup. This is a relay result recorded before lineup
          snapshots were added.
        </p>
      )}
    </div>
  );
}

/** Compact heat/lane/round/exhibition/DQ-code badges shown under a result's time. */
function ResultMetaBadges({ row }: { row: ResultRow }) {
  const hasHeatLane = row.heat != null || row.lane != null;
  if (
    !hasHeatLane &&
    !row.round &&
    !row.exhibition &&
    !(row.isDq && row.dqCode) &&
    !row.note
  ) {
    return null;
  }
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {row.note ? (
        <Badge variant="outline" className="h-4.5 px-1.5 text-[10px]">
          {row.note}
        </Badge>
      ) : null}
      {row.round ? (
        <Badge variant="outline" className="h-4.5 px-1.5 text-[10px]">
          {ROUND_LABEL[row.round] ?? row.round}
        </Badge>
      ) : null}
      {hasHeatLane ? (
        <Badge variant="outline" className="h-4.5 px-1.5 text-[10px]">
          H{row.heat ?? "—"} L{row.lane ?? "—"}
        </Badge>
      ) : null}
      {row.exhibition ? (
        <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px]">
          Exhibition
        </Badge>
      ) : null}
      {row.isDq && row.dqCode ? (
        <Badge variant="destructive" className="h-4.5 px-1.5 text-[10px]">
          {row.dqCode}
        </Badge>
      ) : null}
    </span>
  );
}

function StandardCompareIndicator({
  compare,
}: {
  compare: StandardCompare | null;
}) {
  if (!compare) return null;

  if (compare === "faster") {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400"
        title="Faster than standard"
      >
        <RabbitIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="sr-only">Faster than standard</span>
      </span>
    );
  }

  if (compare === "equal") {
    return (
      <span
        className="text-muted-foreground inline-flex items-center gap-0.5"
        title="Exactly at standard"
      >
        <TargetIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="sr-only">Exactly at standard</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400"
      title="Slower than standard"
    >
      <TurtleIcon className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">Slower than standard</span>
    </span>
  );
}

export function ResultsWorkspace({
  teamId,
  meetId,
  meetName,
  meetStartDate,
  results,
  events,
  swimmers,
  relayLineup,
  relayAttempts,
  standardSets,
}: {
  teamId: string;
  meetId: string;
  meetName: string;
  meetStartDate: Date;
  results: ResultRow[];
  events: ResultEventOption[];
  swimmers: ResultSwimmerOption[];
  relayLineup: RelayLineupPrefill[];
  relayAttempts: RelayAttempt[];
  standardSets: StandardSetOption[];
}) {
  const [pbtsOnly, setPbtsOnly] = useState(false);
  const [showPercent, setShowPercent] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>("event");
  const [roundFilter, setRoundFilter] = useState<RoundFilter>("all");
  const [showStandards, setShowStandards] = useState(false);
  const [selectedSetId, setSelectedSetId] = useState(standardSets[0]?.id ?? "");
  const [cuts, setCuts] = useState<StandardCut[]>([]);
  const [cutsPending, startCutsTransition] = useTransition();

  useEffect(() => {
    if (!showStandards || !selectedSetId) {
      setCuts([]);
      return;
    }
    startCutsTransition(async () => {
      try {
        const data = await getTimeStandardCutsAction(teamId, selectedSetId);
        setCuts(data.cuts);
      } catch {
        setCuts([]);
      }
    });
  }, [showStandards, selectedSetId, teamId]);

  const individualResults = useMemo(
    () => results.filter((row) => !isRelayStroke(row.stroke, row.eventKey)),
    [results],
  );

  const splitRows = useMemo((): ResultRow[] => {
    return relayAttempts.flatMap((attempt) =>
      attempt.splits.map((split) => ({
        id: split.id,
        meetEventId: attempt.meetEventId,
        swimmerId: split.swimmerId,
        timeMs: split.timeMs,
        previousBestTimeMs: null,
        place: null,
        isDq: attempt.isDq,
        round: attempt.round,
        heat: attempt.heat,
        lane: attempt.lane,
        exhibition: attempt.exhibition,
        dqCode: attempt.dqCode,
        firstName: split.firstName,
        lastName: split.lastName,
        dateOfBirth: null,
        eventNumber: attempt.eventNumber,
        distance: attempt.distance,
        stroke: attempt.stroke,
        gender: attempt.gender,
        ageGroup: attempt.ageGroup,
        eventKey: attempt.eventKey,
        note:
          split.legOrder === 1
            ? `${attempt.relayLetter} lead-off`
            : `${attempt.relayLetter} leg ${split.legOrder}`,
      })),
    );
  }, [relayAttempts]);

  const availableRounds = useMemo(() => {
    const rounds = new Set<ResultRow["round"]>();
    for (const row of individualResults) {
      if (row.round) rounds.add(row.round);
    }
    for (const attempt of relayAttempts) {
      if (attempt.round) rounds.add(attempt.round);
    }
    const order: Array<NonNullable<ResultRow["round"]>> = [
      "prelim",
      "swimoff",
      "finals",
    ];
    return order.filter((r) => rounds.has(r));
  }, [individualResults, relayAttempts]);

  const filtered = useMemo(() => {
    let rows =
      groupMode === "swimmer"
        ? [...individualResults, ...splitRows]
        : individualResults;
    if (roundFilter !== "all") {
      rows = rows.filter((r) => r.round === roundFilter);
    }
    if (!pbtsOnly) return rows;
    return rows.filter(isPersonalBest);
  }, [individualResults, splitRows, groupMode, roundFilter, pbtsOnly]);

  const filteredRelayAttempts = useMemo(() => {
    if (pbtsOnly) return [];
    if (roundFilter === "all") return relayAttempts;
    return relayAttempts.filter((attempt) => attempt.round === roundFilter);
  }, [relayAttempts, pbtsOnly, roundFilter]);

  const summary = useMemo(() => {
    const athleteIds = new Set(individualResults.map((r) => r.swimmerId));
    for (const attempt of relayAttempts) {
      for (const member of attempt.members) athleteIds.add(member.swimmerId);
    }
    return {
      individualCount: individualResults.length,
      relayCount: relayAttempts.length,
      athleteCount: athleteIds.size,
      pbtCount: individualResults.filter(isPersonalBest).length,
    };
  }, [individualResults, relayAttempts]);

  const groups = useMemo(() => {
    if (groupMode === "swimmer") {
      const bySwimmer = new Map<
        string,
        {
          label: string;
          sortKey: string;
          rows: ResultRow[];
          relayAttempts: RelayAttempt[];
        }
      >();
      for (const row of filtered) {
        const key = row.swimmerId;
        const existing = bySwimmer.get(key);
        if (existing) {
          existing.rows.push(row);
          continue;
        }
        bySwimmer.set(key, {
          label: `${row.firstName} ${row.lastName}`,
          sortKey: `${row.lastName} ${row.firstName}`.toLowerCase(),
          rows: [row],
          relayAttempts: [],
        });
      }
      return [...bySwimmer.values()]
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .map((g) => ({
          ...g,
          rows: [...g.rows].sort((a, b) => {
            const an = a.eventNumber ?? Number.MAX_SAFE_INTEGER;
            const bn = b.eventNumber ?? Number.MAX_SAFE_INTEGER;
            return an - bn || compareResultRows(a, b);
          }),
        }));
    }

    const byEvent = new Map<
      string,
      {
        label: string;
        eventNumber: number | null;
        rows: ResultRow[];
        relayAttempts: RelayAttempt[];
      }
    >();
    for (const row of filtered) {
      const existing = byEvent.get(row.meetEventId);
      if (existing) {
        existing.rows.push(row);
        continue;
      }
      byEvent.set(row.meetEventId, {
        eventNumber: row.eventNumber,
        label: eventLabel(row),
        rows: [row],
        relayAttempts: [],
      });
    }
    for (const attempt of filteredRelayAttempts) {
      const existing = byEvent.get(attempt.meetEventId);
      if (existing) {
        existing.relayAttempts.push(attempt);
        continue;
      }
      byEvent.set(attempt.meetEventId, {
        eventNumber: attempt.eventNumber,
        label: relayEventLabel(attempt),
        rows: [],
        relayAttempts: [attempt],
      });
    }
    return [...byEvent.values()]
      .sort((a, b) => {
        const an = a.eventNumber ?? Number.MAX_SAFE_INTEGER;
        const bn = b.eventNumber ?? Number.MAX_SAFE_INTEGER;
        return an - bn;
      })
      .map((g) => ({
        label: g.label,
        rows: [...g.rows].sort(compareResultRows),
        relayAttempts: g.relayAttempts,
      }));
  }, [filtered, filteredRelayAttempts, groupMode]);

  const hasSets = standardSets.length > 0;
  const standardSetOptions = standardSets.map((set) => ({
    value: set.id,
    label: `${set.name}${set.seasonLabel ? ` (${set.seasonLabel})` : ""}`,
  }));

  const nameColumnLabel = groupMode === "event" ? "Swimmer" : "Event";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <div className="bg-muted/40 min-w-28 rounded-lg border px-4 py-3">
          <p className="text-2xl font-semibold tabular-nums">
            {summary.individualCount}
          </p>
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            Individual
          </p>
        </div>
        <div className="bg-muted/40 min-w-28 rounded-lg border px-4 py-3">
          <p className="text-2xl font-semibold tabular-nums">
            {summary.relayCount}
          </p>
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            Relays
          </p>
        </div>
        <div className="bg-muted/40 min-w-28 rounded-lg border px-4 py-3">
          <p className="text-2xl font-semibold tabular-nums">
            {summary.athleteCount}
          </p>
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            Athletes
          </p>
        </div>
        <div className="bg-muted/40 min-w-28 rounded-lg border px-4 py-3">
          <p className="text-2xl font-semibold tabular-nums">
            {summary.pbtCount}
          </p>
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            PBTs
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border px-4 py-3">
        <div className="flex items-center gap-2">
          <Switch
            id="pbts-only"
            checked={pbtsOnly}
            onCheckedChange={setPbtsOnly}
          />
          <Label htmlFor="pbts-only" className="text-sm font-normal">
            PBTs only
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="show-percent"
            checked={showPercent}
            onCheckedChange={setShowPercent}
          />
          <Label htmlFor="show-percent" className="text-sm font-normal">
            Show %
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="by-swimmer"
            checked={groupMode === "swimmer"}
            onCheckedChange={(checked) =>
              setGroupMode(checked ? "swimmer" : "event")
            }
          />
          <Label htmlFor="by-swimmer" className="text-sm font-normal">
            By swimmer
          </Label>
        </div>
        {availableRounds.length > 0 ? (
          <div className="flex items-center gap-2">
            <Label htmlFor="round-filter" className="text-sm font-normal">
              Round
            </Label>
            <Select
              items={[
                { value: "all", label: "All" },
                ...availableRounds.map((round) => ({
                  value: round,
                  label: ROUND_LABEL[round] ?? round,
                })),
              ]}
              value={roundFilter}
              onValueChange={(v) => setRoundFilter((v ?? "all") as RoundFilter)}
            >
              <SelectTrigger id="round-filter" className="h-8 w-32" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All</SelectItem>
                  {availableRounds.map((round) => (
                    <SelectItem key={round} value={round}>
                      {ROUND_LABEL[round] ?? round}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            !hasSets && "opacity-60",
          )}
        >
          <Switch
            id="show-standards"
            checked={showStandards}
            onCheckedChange={setShowStandards}
            disabled={!hasSets}
            size="sm"
          />
          <Label
            htmlFor="show-standards"
            className={cn(
              "text-sm font-normal",
              !hasSets && "text-muted-foreground",
            )}
          >
            {hasSets
              ? "Show time standards"
              : "Time standards (no sets loaded)"}
          </Label>
          {showStandards && hasSets ? (
            <Select
              items={standardSetOptions}
              value={selectedSetId}
              onValueChange={(v) => setSelectedSetId(v ?? "")}
            >
              <SelectTrigger className="h-8 w-48" size="sm">
                <SelectValue placeholder="Select set" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {standardSets.map((set) => (
                    <SelectItem key={set.id} value={set.id}>
                      {set.name}
                      {set.seasonLabel ? ` (${set.seasonLabel})` : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : null}
          {cutsPending ? (
            <span className="text-muted-foreground text-xs">Loading…</span>
          ) : null}
          {showStandards && hasSets && !cutsPending ? (
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-0.5">
                <RabbitIcon className="size-3" aria-hidden /> Under = faster
              </span>
              <span className="inline-flex items-center gap-0.5">
                <TargetIcon className="size-3" aria-hidden /> At = equal
              </span>
              <span className="inline-flex items-center gap-0.5">
                <TurtleIcon className="size-3" aria-hidden /> Over = slower
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <AddResultForm
        teamId={teamId}
        meetId={meetId}
        events={events}
        swimmers={swimmers}
        relayLineup={relayLineup}
      />

      {groups.length === 0 ? (
        <div className="border-border rounded-lg border px-4 py-8 text-center">
          <p className="text-muted-foreground text-sm">
            {individualResults.length === 0 && relayAttempts.length === 0
              ? "No results yet. Import a meet file or add a time manually."
              : "No personal bests match this filter."}
          </p>
        </div>
      ) : groups.length === 0 ? null : (
        groups.map((group) => {
          const resultCount = group.rows.length + group.relayAttempts.length;
          return (
            <div
              key={group.label}
              className="border-border overflow-hidden rounded-lg border"
            >
              <div className="border-border bg-muted/30 border-b px-4 py-3">
                <h3 className="text-sm font-semibold">{group.label}</h3>
                <p className="text-muted-foreground text-xs">
                  {resultCount} {resultCount === 1 ? "result" : "results"}
                </p>
              </div>
              {group.relayAttempts.length > 0 ? (
                <div className="flex flex-col gap-3 p-3">
                  {group.relayAttempts.map((attempt) => (
                    <RelayResultCard
                      key={attempt.id}
                      attempt={attempt}
                      teamId={teamId}
                      meetId={meetId}
                    />
                  ))}
                </div>
              ) : null}
              {group.rows.length > 0 ? (
                <Table className="table-fixed [&_th]:px-4 [&_td]:px-4">
                  <colgroup>
                    {showStandards ? (
                      <>
                        <col style={{ width: "20%" }} />
                        <col style={{ width: "7%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "8%" }} />
                        <col style={{ width: "27%" }} />
                      </>
                    ) : (
                      <>
                        <col style={{ width: "22%" }} />
                        <col style={{ width: "8%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "16%" }} />
                        <col style={{ width: "10%" }} />
                        <col style={{ width: "30%" }} />
                      </>
                    )}
                  </colgroup>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{nameColumnLabel}</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Previous Best</TableHead>
                      {showStandards ? <TableHead>Standard</TableHead> : null}
                      <TableHead>Place</TableHead>
                      <TableHead>Improvement</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map((row) => {
                      const age = swimmerAgeOnDate(
                        row.dateOfBirth,
                        meetStartDate,
                      );
                      const delta = improvementSeconds(row);
                      const faster = delta != null && delta < 0;
                      const slower = delta != null && delta > 0;
                      const cutMs = showStandards
                        ? findCutTime(cuts, row, meetStartDate)
                        : null;
                      const standardCompare =
                        cutMs != null
                          ? compareToStandard(row.timeMs, cutMs, row.isDq)
                          : null;
                      const meetsCut =
                        standardCompare === "faster" ||
                        standardCompare === "equal";
                      const newlyQualifies =
                        meetsCut &&
                        row.previousBestTimeMs != null &&
                        cutMs != null &&
                        row.previousBestTimeMs > cutMs;
                      const primaryLabel =
                        groupMode === "event"
                          ? `${row.firstName} ${row.lastName}`
                          : eventLabel(row);
                      return (
                        <TableRow
                          key={row.id}
                          className={cn(
                            newlyQualifies && "bg-emerald-500/5",
                            meetsCut && !newlyQualifies && "bg-sky-500/5",
                          )}
                        >
                          <TableCell className="max-w-0 font-medium">
                            <span
                              className="block truncate"
                              title={primaryLabel}
                            >
                              {primaryLabel}
                            </span>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {age ?? "—"}
                          </TableCell>
                          <TableCell className="font-timing tabular-nums">
                            <span className="flex flex-col">
                              <span
                                className={cn(
                                  row.isDq && "text-destructive line-through",
                                )}
                              >
                                {formatResultMark(
                                  row.timeMs,
                                  row.isDq,
                                  row.dqCode,
                                )}
                              </span>
                              <ResultMetaBadges row={row} />
                            </span>
                          </TableCell>
                          <TableCell className="font-timing tabular-nums">
                            {row.previousBestTimeMs != null &&
                            row.previousBestTimeMs > 0
                              ? formatTime(row.previousBestTimeMs)
                              : "—"}
                          </TableCell>
                          {showStandards ? (
                            <TableCell
                              className={cn(
                                "font-timing",
                                standardCompare === "faster" &&
                                  "text-emerald-700 dark:text-emerald-400",
                                standardCompare === "slower" &&
                                  "text-amber-800 dark:text-amber-400",
                              )}
                              title={
                                newlyQualifies
                                  ? "Newly qualifies vs previous best"
                                  : standardCompare === "faster"
                                    ? "Faster than standard"
                                    : standardCompare === "equal"
                                      ? "Exactly at standard"
                                      : standardCompare === "slower"
                                        ? "Slower than standard"
                                        : undefined
                              }
                            >
                              {cutMs != null ? (
                                <span className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                                  <span className="tabular-nums font-semibold">
                                    {formatTime(cutMs)}
                                  </span>
                                  <StandardCompareIndicator
                                    compare={standardCompare}
                                  />
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          ) : null}
                          <TableCell className="tabular-nums">
                            {row.place ?? "—"}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "font-timing tabular-nums",
                              faster &&
                                "text-emerald-600 dark:text-emerald-400",
                              slower && "text-red-600 dark:text-red-400",
                            )}
                          >
                            {formatImprovement(
                              delta,
                              showPercent,
                              row.previousBestTimeMs,
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : null}
            </div>
          );
        })
      )}

      <p className="text-muted-foreground sr-only">
        Results for {meetName} on {formatDateOnlyLabel(meetStartDate)}
      </p>
    </div>
  );
}
