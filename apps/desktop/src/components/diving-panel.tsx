import {
  diveProblems,
  diveResult,
  diveSettings,
  diveSheet,
  isDiveScored,
  isValidAward,
  runningTotal,
  saveDiveSheet,
  scoreDive,
} from "@lane4hq/meet-engine/diving";
import { eventTitle, indexMeet } from "@lane4hq/meet-engine/labels";
import {
  type Dive,
  type DivePosition,
  heatKey,
  type LaneResult,
  type ResultStatus,
} from "@lane4hq/meet-engine/model";
import { heatsForEvent } from "@lane4hq/meet-engine/seeding";
import { Badge } from "@lane4hq/ui/components/badge";
import { Button } from "@lane4hq/ui/components/button";
import { Input } from "@lane4hq/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lane4hq/ui/components/table";
import { cn } from "@lane4hq/ui/lib/utils";
import { BadgeCheck } from "lucide-react";
import { useState } from "react";
import { useMeet } from "../state/meet-context";
import { NativeSelect } from "./native-select";

const POSITIONS: DivePosition[] = ["A", "B", "C", "D"];

const STATUS_LABEL: Partial<Record<ResultStatus, string>> = {
  ok: "Diving",
  ns: "No show",
  dq: "DQ",
};

function parseNumber(text: string): number {
  const n = Number(text.trim());
  return Number.isFinite(n) ? n : Number.NaN;
}

/** The diving table's scoresheet: one round at a time, then verify. */
export function DivingPanel({
  eventId,
  onVerify,
}: {
  eventId: string;
  onVerify: (results: LaneResult[]) => void;
}) {
  const {
    state: { meet },
    actions: { update },
  } = useMeet();
  const index = indexMeet(meet);
  const event = index.event(eventId)!;
  const { diveCount, diveJudges } = diveSettings(meet, eventId);
  const flight = heatsForEvent(meet, eventId)[0];
  const verified = meet.heatRecords[heatKey(eventId, 1)];
  const [round, setRound] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, ResultStatus>>(() =>
    Object.fromEntries(
      meet.results
        .filter((r) => r.eventId === eventId)
        .map((r) => [r.entryId, r.status]),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  if (!flight) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Draw the dive order on the Heats screen first.
      </p>
    );
  }

  const divers = flight.lanes.map(({ lane, entryId }) => ({
    order: lane,
    entryId,
    entry: index.entry(entryId)!,
    sheet: diveSheet(meet, eventId, entryId),
    status: statuses[entryId] ?? "ok",
  }));
  const standings = divers
    .filter((d) => d.status === "ok")
    .map((d) => ({ ...d, total: runningTotal(d.sheet, diveJudges) }))
    .sort((a, b) => b.total - a.total);

  function saveDive(entryId: string, sheet: Dive[], patch: Partial<Dive>) {
    const dives = sheet.map((d, i) => (i === round ? { ...d, ...patch } : d));
    update((m) => saveDiveSheet(m, eventId, entryId, dives));
  }

  function verify() {
    try {
      setError(null);
      const results = divers.map((d) => {
        if (d.status === "ok") {
          const open = d.sheet.findIndex(
            (dive) => !isDiveScored(dive, diveJudges),
          );
          if (open >= 0) {
            throw new Error(
              `${index.entryLabel(d.entry)}: dive ${open + 1} isn't scored yet.`,
            );
          }
        }
        return diveResult(
          meet,
          { eventId, heat: 1, lane: d.order, entryId: d.entryId },
          d.sheet,
          d.status,
        );
      });
      onVerify(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight">
            Event {event.number} · {eventTitle(event)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {diveJudges} judges
            {diveJudges > 3
              ? `, high and low ${diveJudges === 7 ? "two" : ""} dropped`
              : ""}{" "}
            · score = awards × DD
          </p>
        </div>
        {verified ? <Badge>Verified</Badge> : null}
      </header>

      <nav aria-label="Rounds" className="flex flex-wrap gap-1">
        {Array.from({ length: diveCount }, (_, i) => (
          <Button
            key={i}
            size="sm"
            variant={round === i ? "default" : "outline"}
            aria-current={round === i ? "step" : undefined}
            onClick={() => setRound(i)}
          >
            Round {i + 1}
          </Button>
        ))}
      </nav>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Order</TableHead>
              <TableHead>Diver</TableHead>
              <TableHead className="w-20">Dive</TableHead>
              <TableHead className="w-16">Pos</TableHead>
              <TableHead className="w-16">DD</TableHead>
              {Array.from({ length: diveJudges }, (_, j) => (
                <TableHead key={j} className="w-14 text-center">
                  J{j + 1}
                </TableHead>
              ))}
              <TableHead className="w-24">Failed / balk</TableHead>
              <TableHead className="w-16 text-right">Score</TableHead>
              <TableHead className="w-20 text-right">Total</TableHead>
              <TableHead className="w-28">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {divers.map((d) => {
              const dive = d.sheet[round]!;
              const out = d.status !== "ok";
              const scored = isDiveScored(dive, diveJudges);
              const problems = diveProblems(dive, diveJudges);
              const k = `${d.entryId}:${round}:${diveJudges}`;
              return (
                <TableRow key={d.entryId} className={cn(out && "opacity-50")}>
                  <TableCell className="font-mono tabular-nums">
                    {d.order}
                  </TableCell>
                  <TableCell>
                    <span className="block truncate">
                      {index.entryLabel(d.entry)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {d.entry.teamCode}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Input
                      key={`${k}:code`}
                      aria-label="Dive number"
                      className="h-7 w-20 px-2 font-mono"
                      defaultValue={dive.code}
                      disabled={out}
                      onBlur={(e) =>
                        saveDive(d.entryId, d.sheet, {
                          code: e.currentTarget.value.trim().toUpperCase(),
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <NativeSelect
                      aria-label="Position"
                      value={dive.position}
                      disabled={out}
                      onChange={(e) =>
                        saveDive(d.entryId, d.sheet, {
                          position: e.currentTarget.value as DivePosition,
                        })
                      }
                    >
                      {POSITIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </NativeSelect>
                  </TableCell>
                  <TableCell>
                    <Input
                      key={`${k}:dd`}
                      aria-label="Degree of difficulty"
                      inputMode="decimal"
                      className="h-7 w-16 px-2 font-mono tabular-nums"
                      defaultValue={dive.dd ? dive.dd.toFixed(1) : ""}
                      disabled={out}
                      onBlur={(e) =>
                        saveDive(d.entryId, d.sheet, {
                          dd: parseNumber(e.currentTarget.value) || 0,
                        })
                      }
                    />
                  </TableCell>
                  {dive.awards.map((award, j) => (
                    <TableCell key={j}>
                      <Input
                        key={`${k}:j${j}`}
                        aria-label={`Judge ${j + 1} award`}
                        aria-invalid={!isValidAward(award) || undefined}
                        inputMode="decimal"
                        className="h-7 w-14 px-1 text-center font-mono tabular-nums"
                        defaultValue={award ? String(award) : ""}
                        disabled={out || dive.failed}
                        onBlur={(e) => {
                          const value = parseNumber(e.currentTarget.value);
                          const awards = dive.awards.map((a, n) =>
                            n === j ? (Number.isNaN(value) ? 0 : value) : a,
                          );
                          saveDive(d.entryId, d.sheet, { awards });
                        }}
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex items-center gap-2 text-xs">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={dive.failed === true}
                          disabled={out}
                          onChange={(e) =>
                            saveDive(d.entryId, d.sheet, {
                              failed: e.currentTarget.checked,
                            })
                          }
                        />
                        F
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={dive.balk === true}
                          disabled={out || dive.failed}
                          onChange={(e) =>
                            saveDive(d.entryId, d.sheet, {
                              balk: e.currentTarget.checked,
                            })
                          }
                        />
                        Balk
                      </label>
                    </div>
                  </TableCell>
                  <TableCell
                    className="text-right font-mono tabular-nums"
                    title={scored ? undefined : problems.join(" ")}
                  >
                    {scored ? scoreDive(dive, diveJudges).toFixed(2) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium tabular-nums">
                    {runningTotal(d.sheet, diveJudges).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <NativeSelect
                      aria-label="Status"
                      value={d.status}
                      onChange={(e) => {
                        const status = e.currentTarget.value as ResultStatus;
                        setStatuses((s) => ({ ...s, [d.entryId]: status }));
                      }}
                    >
                      {Object.entries(STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Standings</h2>
        <ol className="flex max-w-sm flex-col gap-1 text-sm">
          {standings.map((d, i) => (
            <li key={d.entryId} className="flex items-center gap-2">
              <span className="w-5 font-mono text-xs text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <span className="flex-1 truncate">
                {index.entryLabel(d.entry)}
              </span>
              <span className="font-mono tabular-nums">
                {d.total.toFixed(2)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button onClick={verify}>
          <BadgeCheck />
          {verified ? "Re-verify scores" : "Verify scores"}
        </Button>
      </div>
    </div>
  );
}
