import type { HeatReview, ReviewFlag } from "@lane4hq/meet-engine/adjudicate";
import {
  displayTime,
  eventTitle,
  heatLabel,
  indexMeet,
} from "@lane4hq/meet-engine/labels";
import {
  heatKey,
  type LaneResult,
  type ResultStatus,
  type TimerCapture,
} from "@lane4hq/meet-engine/model";
import { heatsForEvent } from "@lane4hq/meet-engine/seeding";
import { parseTime } from "@lane4hq/swim-core/times";
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
import { BadgeCheck, EyeOff, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useMeet } from "../state/meet-context";
import { NativeSelect } from "./native-select";

const FLAG_TEXT: Record<ReviewFlag, string> = {
  "no-pad-time": "No touchpad time; using backup",
  "pad-backup-mismatch": "Pad and backup disagree",
  "timer-dq": "Console marked DQ",
  "early-takeoff": "Early relay takeoff",
  "no-time": "No time recorded",
  "time-in-empty-lane": "Time in an empty lane",
};

const STATUS_LABEL: Record<ResultStatus, string> = {
  ok: "Finished",
  dq: "DQ",
  ns: "No show",
  dnf: "Did not finish",
};

/** Seconds with thousandths, e.g. `1:05.432`, for comparing pad and backup. */
function thousandths(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(3);
  return minutes ? `${minutes}:${seconds.padStart(6, "0")}` : seconds;
}

export function ReviewPanel({
  capture,
  review,
  onAssign,
  onIgnore,
  onVerify,
}: {
  capture: TimerCapture | null;
  review: HeatReview | null;
  onAssign: (assignment: { eventId: string; heat: number } | null) => void;
  onIgnore: () => void;
  onVerify: (results: LaneResult[]) => void;
}) {
  const {
    state: { meet },
  } = useMeet();
  const index = useMemo(() => indexMeet(meet), [meet]);
  const [edits, setEdits] = useState<Map<number, LaneResult>>(
    () =>
      new Map(
        (review?.lanes ?? []).flatMap((l) =>
          l.result ? [[l.lane, l.result] as const] : [],
        ),
      ),
  );
  const [error, setError] = useState<string | null>(null);

  const event = review ? index.event(review.eventId) : undefined;
  const verified = review
    ? meet.heatRecords[heatKey(review.eventId, review.heat)]
    : undefined;

  function edit(lane: number, patch: Partial<LaneResult>) {
    setEdits((current) => {
      const next = new Map(current);
      const base = next.get(lane);
      if (base) next.set(lane, { ...base, ...patch });
      return next;
    });
  }

  function verify() {
    const results = [...edits.values()];
    const missing = results.find((r) => r.status === "ok" && !r.timeMs);
    if (missing) {
      setError(`Lane ${missing.lane} is marked finished but has no time.`);
      return;
    }
    setError(null);
    onVerify(results);
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">
            {event
              ? `Event ${event.number} · ${eventTitle(event)} · ${heatLabel(event, review!.heat)}`
              : "Assign this race"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {capture
              ? `Console race ${capture.race.raceNumber}${capture.race.event ? `, titled E${capture.race.event} H${capture.race.heat}` : ", untitled"} · ${capture.race.raceLengths} lengths${capture.timerVersion ? ` · ${capture.timerVersion}` : ""}`
              : "Entered by hand"}
            {verified ? ` · verified (revision ${verified.revision})` : ""}
          </p>
        </div>
        {capture ? (
          <AssignmentPicker capture={capture} onAssign={onAssign} />
        ) : null}
      </header>

      {review?.warnings.length ? (
        <ul className="flex flex-col gap-1 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          {review.warnings.map((w) => (
            <li key={w} className="flex items-center gap-2">
              <TriangleAlert className="size-3.5 text-amber-600" />
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      {review ? (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Lane</TableHead>
                <TableHead>{event?.isRelay ? "Relay" : "Swimmer"}</TableHead>
                <TableHead className="w-12">Place</TableHead>
                <TableHead className="w-24 text-right">Pad</TableHead>
                <TableHead className="w-24 text-right">Backup</TableHead>
                <TableHead className="w-32">Official time</TableHead>
                <TableHead className="w-36">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {review.lanes.map((lane) => {
                const entry = lane.entryId
                  ? index.entry(lane.entryId)
                  : undefined;
                const result = edits.get(lane.lane);
                const flagged = lane.flags.length > 0;
                return (
                  <TableRow
                    key={lane.lane}
                    className={cn(
                      !entry && "text-muted-foreground",
                      flagged && "bg-amber-500/5",
                    )}
                  >
                    <TableCell className="font-mono tabular-nums">
                      {lane.lane}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-col gap-1">
                        <span>
                          {entry
                            ? `${index.entryLabel(entry)} · ${entry.teamCode}`
                            : "Empty lane"}
                        </span>
                        {lane.flags.length ? (
                          <span className="flex flex-wrap gap-1">
                            {lane.flags.map((f) => (
                              <Badge
                                key={f}
                                variant={
                                  f === "timer-dq" || f === "early-takeoff"
                                    ? "destructive"
                                    : "outline"
                                }
                              >
                                {FLAG_TEXT[f]}
                              </Badge>
                            ))}
                          </span>
                        ) : null}
                        {lane.timer &&
                        lane.timer.splitsMs.length > 1 &&
                        lane.timer.splitsMs.some((s) => s != null) ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {lane.timer.splitsMs
                              .map((s) => (s == null ? "—" : displayTime(s)))
                              .join("  ")}
                          </span>
                        ) : null}
                        {entry && lane.timer?.relayExchangesMs.length ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            Exchanges:{" "}
                            {lane.timer.relayExchangesMs
                              .map((x) => (x / 1000).toFixed(2))
                              .join("  ")}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {lane.timer
                        ? lane.timer.place > 0
                          ? lane.timer.place
                          : lane.timer.place < 0
                            ? "DQ"
                            : ""
                        : ""}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {thousandths(lane.timer?.finalMs)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {thousandths(result?.backupMs ?? lane.timer?.backupMs)}
                      {lane.timer?.buttonsMs.some((b) => b != null) ? (
                        <div className="text-[10px] text-muted-foreground">
                          {lane.timer.buttonsMs
                            .map((b) => thousandths(b))
                            .join(" / ")}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {result ? (
                        <div className="flex flex-col gap-1">
                          <TimeInput
                            key={`${result.timeMs}:${result.source}`}
                            timeMs={result.timeMs}
                            onChange={(timeMs) =>
                              edit(lane.lane, {
                                timeMs,
                                source: "manual",
                                status:
                                  timeMs && result.status === "ns"
                                    ? "ok"
                                    : result.status,
                              })
                            }
                          />
                          {result.backupMs != null &&
                          result.source !== "backup" &&
                          flagged ? (
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() =>
                                edit(lane.lane, {
                                  timeMs: result.backupMs,
                                  source: "backup",
                                  status:
                                    result.status === "ns"
                                      ? "ok"
                                      : result.status,
                                })
                              }
                            >
                              Use backup
                            </Button>
                          ) : null}
                          <span className="text-[10px] text-muted-foreground">
                            {result.source === "pad"
                              ? "Touchpad"
                              : result.source === "backup"
                                ? "Backup"
                                : "Entered"}
                          </span>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {result ? (
                        <div className="flex flex-col gap-1">
                          <NativeSelect
                            aria-label={`Lane ${lane.lane} status`}
                            value={result.status}
                            onChange={(e) =>
                              edit(lane.lane, {
                                status: e.currentTarget.value as ResultStatus,
                              })
                            }
                          >
                            {(Object.keys(STATUS_LABEL) as ResultStatus[]).map(
                              (s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABEL[s]}
                                </option>
                              ),
                            )}
                          </NativeSelect>
                          {result.status === "dq" ? (
                            <Input
                              aria-label={`Lane ${lane.lane} DQ code`}
                              placeholder="DQ code"
                              defaultValue={result.dqCode ?? ""}
                              maxLength={4}
                              className="h-7 font-mono uppercase"
                              onBlur={(e) =>
                                edit(lane.lane, {
                                  dqCode:
                                    e.currentTarget.value
                                      .trim()
                                      .toUpperCase() || undefined,
                                })
                              }
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          The console didn't say which event and heat this was. Pick it above;
          later races follow on automatically.
        </p>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <footer className="flex flex-wrap items-center gap-2">
        {review ? (
          <Button
            onClick={verify}
            disabled={review.lanes.every((l) => !l.result)}
          >
            <BadgeCheck />
            {verified ? "Re-verify heat" : "Verify results"}
          </Button>
        ) : null}
        {capture && capture.state !== "ignored" ? (
          <Button variant="ghost" onClick={onIgnore}>
            <EyeOff />
            Ignore race (false start, test swim)
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground">
          Verified heats are official: they count toward places and scores,
          export, and publish.
        </span>
      </footer>
    </div>
  );
}

function AssignmentPicker({
  capture,
  onAssign,
}: {
  capture: TimerCapture;
  onAssign: (assignment: { eventId: string; heat: number } | null) => void;
}) {
  const {
    state: { meet },
  } = useMeet();
  const eventId = capture.assignment?.eventId ?? "";
  const heats = eventId ? heatsForEvent(meet, eventId) : [];
  const event = meet.events.find((e) => e.id === eventId);
  return (
    <div className="flex items-center gap-1.5">
      <NativeSelect
        aria-label="Event"
        className="w-64"
        value={eventId}
        onChange={(e) =>
          onAssign(
            e.currentTarget.value
              ? { eventId: e.currentTarget.value, heat: 1 }
              : null,
          )
        }
      >
        <option value="">Choose event…</option>
        {meet.events
          .filter(
            (ev) => ev.kind !== "dive" && heatsForEvent(meet, ev.id).length > 0,
          )
          .map((ev) => (
            <option key={ev.id} value={ev.id}>
              E{ev.number} · {eventTitle(ev)}
            </option>
          ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Heat"
        className="w-28"
        value={String(capture.assignment?.heat ?? "")}
        disabled={!eventId}
        onChange={(e) =>
          onAssign({ eventId, heat: Number(e.currentTarget.value) })
        }
      >
        {heats.map((h) => (
          <option key={h.number} value={h.number}>
            {event ? heatLabel(event, h.number) : `Heat ${h.number}`}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

function TimeInput({
  timeMs,
  onChange,
}: {
  timeMs: number | null;
  onChange: (ms: number | null) => void;
}) {
  const [invalid, setInvalid] = useState(false);
  return (
    <Input
      aria-label="Official time"
      aria-invalid={invalid || undefined}
      defaultValue={timeMs ? displayTime(timeMs) : ""}
      placeholder="m:ss.hh"
      className="h-7 font-mono tabular-nums"
      onBlur={(e) => {
        const text = e.currentTarget.value.trim();
        if (!text) {
          setInvalid(false);
          onChange(null);
          return;
        }
        const ms = parseTime(text);
        const ok =
          Number.isFinite(ms) &&
          ms > 0 &&
          /^\d{0,2}:?\d{1,2}(\.\d{1,3})?$/.test(text);
        setInvalid(!ok);
        if (ok && ms !== timeMs) onChange(ms);
      }}
    />
  );
}
