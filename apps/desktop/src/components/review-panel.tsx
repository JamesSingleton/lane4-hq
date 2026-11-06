import type { HeatReview, ReviewFlag } from "@lane4hq/meet-engine/adjudicate";
import {
  displayTime,
  eventTitle,
  finalLabel,
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
import { Button } from "@lane4hq/ui/components/button";
import { Input } from "@lane4hq/ui/components/input";
import { cn } from "@lane4hq/ui/lib/utils";
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { canVerify, initialResults } from "../lib/run-order";
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

/** Lane, then place, pad, backup, official time, and status. */
const LANE_COLUMNS =
  "grid grid-cols-[minmax(8rem,1fr)_2.25rem_4.75rem_4.75rem_5rem_7rem] items-center gap-x-2 lg:grid-cols-[minmax(0,1fr)_2.75rem_5.5rem_5.5rem_6rem_11rem] lg:gap-x-3";

/** Seconds with thousandths, e.g. `1:05.432`, for comparing pad and backup. */
function thousandths(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(3);
  return minutes ? `${minutes}:${seconds.padStart(6, "0")}` : seconds;
}

function placeText(lane: HeatReview["lanes"][number]): string {
  const place = lane.timer?.place ?? 0;
  if (place > 0) return String(place);
  return place < 0 ? "DQ" : "";
}

export function ReviewPanel({
  capture,
  review,
  draft,
  onDraft,
  onStep,
  onAssign,
  onIgnore,
  onVerify,
}: {
  capture: TimerCapture | null;
  review: HeatReview | null;
  /** Edits from an earlier visit to this heat. */
  draft: Map<number, LaneResult> | undefined;
  onDraft: (edits: Map<number, LaneResult>) => void;
  onStep: ((direction: 1 | -1) => void) | null;
  onAssign: (assignment: { eventId: string; heat: number } | null) => void;
  onIgnore: () => void;
  onVerify: (results: LaneResult[]) => void;
}) {
  const {
    state: { meet },
  } = useMeet();
  const index = useMemo(() => indexMeet(meet), [meet]);
  const [edits, setEdits] = useState<Map<number, LaneResult>>(
    () => draft ?? (review ? initialResults(meet, review) : new Map()),
  );
  // A time commits as its field blurs, so a shortcut can verify in one go.
  const latestEdits = useRef(edits);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const firstLane = review?.lanes.find((l) => l.flags.length > 0)?.lane;
  const [selected, setSelected] = useState(
    firstLane ?? review?.lanes[0]?.lane ?? 1,
  );

  const event = review ? index.event(review.eventId) : undefined;
  const verified = review
    ? meet.heatRecords[heatKey(review.eventId, review.heat)]
    : undefined;
  const heatCount = event ? heatsForEvent(meet, event.id).length : 0;
  const hasRace = capture !== null;
  const ready = canVerify(edits.values(), hasRace);
  const lane = review?.lanes.find((l) => l.lane === selected);

  function edit(laneNumber: number, patch: Partial<LaneResult>) {
    const next = new Map(latestEdits.current);
    const base = next.get(laneNumber);
    if (base) next.set(laneNumber, { ...base, ...patch });
    latestEdits.current = next;
    setEdits(next);
    onDraft(next);
  }

  function verify() {
    const results = [...latestEdits.current.values()];
    if (!canVerify(results, hasRace)) return;
    const missing = results.find((r) => r.status === "ok" && !r.timeMs);
    if (missing) {
      setError(`Lane ${missing.lane} is marked finished but has no time.`);
      setSelected(missing.lane);
      return;
    }
    setError(null);
    onVerify(results);
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (document.querySelector('[role="dialog"]')) return;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      verify();
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest("input, select, textarea")) return;
    const lanes = review?.lanes ?? [];
    const at = lanes.findIndex((l) => l.lane === selected);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const next = lanes[at + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) {
        e.preventDefault();
        setSelected(next.lane);
      }
    } else if (e.key === "ArrowRight" && onStep) {
      onStep(1);
    } else if (e.key === "ArrowLeft" && onStep) {
      onStep(-1);
    }
  });

  // The board only scrolls when lanes outnumber the window.
  useEffect(() => {
    document
      .querySelector('table[aria-label] tr[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function focusLaneAfter(laneNumber: number) {
    const fields = [
      ...document.querySelectorAll<HTMLInputElement>("[data-lane-time]"),
    ];
    const at = fields.findIndex(
      (f) => f.dataset.laneTime === String(laneNumber),
    );
    fields[at + 1]?.focus();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-4 border-b px-4 py-2.5">
        {event ? (
          <>
            <div className="flex min-w-0 items-baseline gap-2.5">
              <span className="whitespace-nowrap text-2xl font-semibold tabular-nums tracking-tight">
                Event {event.number}
              </span>
              <h1 className="truncate text-base text-muted-foreground">
                {eventTitle(event)}
              </h1>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Previous heat"
                disabled={!onStep}
                onClick={() => onStep?.(-1)}
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-24 text-center text-base font-semibold tabular-nums">
                {finalLabel(event, review!.heat) ??
                  `Heat ${review!.heat} of ${heatCount}`}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Next heat"
                disabled={!onStep}
                onClick={() => onStep?.(1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </>
        ) : (
          <h1 className="text-lg font-semibold tracking-tight">
            Choose a heat for this race
          </h1>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          {capture && capture.state !== "ignored" ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Ignore race"
              onClick={onIgnore}
            >
              <EyeOff />
              <span className="hidden lg:inline">Ignore race</span>
            </Button>
          ) : null}
          {review ? (
            <Button
              size="sm"
              onClick={verify}
              disabled={!ready}
              aria-keyshortcuts="Control+Enter Meta+Enter"
            >
              <BadgeCheck />
              <span className="lg:hidden">
                {verified ? "Verify again" : "Verify"}
              </span>
              <span className="hidden lg:inline">
                {verified ? "Verify again" : "Verify and go to next heat"}
              </span>
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-7 shrink-0 flex-wrap items-center gap-x-3 border-b px-4 py-1 text-xs text-muted-foreground">
        <span>
          {capture
            ? `Console race ${capture.race.raceNumber}, ${capture.race.event ? `titled E${capture.race.event} H${capture.race.heat}` : "untitled"}, ${capture.race.raceLengths} lengths`
            : "Waiting for the console. You can also type times by hand."}
          {verified ? `. Verified, revision ${verified.revision}` : ""}
        </span>
        {capture ? (
          <button
            type="button"
            className="underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() => setMoving((open) => !open)}
          >
            {moving ? "Keep on this heat" : "Move to another heat"}
          </button>
        ) : null}
        {capture && (moving || !review) ? (
          <AssignmentPicker capture={capture} onAssign={onAssign} />
        ) : null}
        {review ? (
          <span className="ml-auto hidden lg:inline">
            Arrow keys change lane and heat. Ctrl or ⌘ + Enter verifies.
          </span>
        ) : null}
      </div>

      {review?.warnings.length ? (
        <ul className="shrink-0 border-b bg-amber-500/5 px-4 py-1.5 text-sm">
          {review.warnings.map((w) => (
            <li key={w} className="flex items-center gap-2">
              <TriangleAlert className="size-3.5 text-amber-600" />
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      {review ? (
        <table
          aria-label="Lanes in this heat"
          className="grid min-h-0 flex-1 content-start overflow-y-auto"
          style={{
            // Rows share the height, so any pool fits until they reach their
            // minimum, and then the board scrolls.
            gridTemplateRows: `auto repeat(${review.lanes.length}, minmax(2.5rem, 3.75rem))`,
          }}
        >
          <thead className="contents">
            <tr
              className={cn(
                LANE_COLUMNS,
                "sticky top-0 z-10 border-b bg-background px-4 py-1 text-xs text-muted-foreground",
              )}
            >
              <th scope="col" className="pl-12 text-left font-normal">
                {event?.isRelay ? "Relay" : "Swimmer"}
              </th>
              <th scope="col" className="text-left font-normal">
                Place
              </th>
              <th scope="col" className="text-right font-normal">
                Pad
              </th>
              <th scope="col" className="text-right font-normal">
                Backup
              </th>
              <th scope="col" className="text-left font-normal">
                Official
              </th>
              <th scope="col" className="text-left font-normal">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="contents">
            {review.lanes.map((row) => {
              const entry = row.entryId ? index.entry(row.entryId) : undefined;
              const result = edits.get(row.lane);
              const serious = row.flags.some(
                (f) => f === "timer-dq" || f === "early-takeoff",
              );
              const flag = row.flags[0];
              return (
                <tr
                  key={row.lane}
                  aria-current={row.lane === selected ? "true" : undefined}
                  className={cn(
                    LANE_COLUMNS,
                    "min-h-0 border-b px-4",
                    row.lane === selected && "bg-muted/60",
                    flag && "shadow-[inset_3px_0_0_var(--color-amber-500)]",
                    serious && "shadow-[inset_3px_0_0_var(--destructive)]",
                  )}
                >
                  <td className="min-w-0">
                    <button
                      type="button"
                      aria-label={`Show lane ${row.lane} details`}
                      onClick={() => setSelected(row.lane)}
                      className="flex w-full min-w-0 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span
                        className={cn(
                          "w-9 shrink-0 text-right text-2xl font-semibold tabular-nums",
                          !entry && "text-muted-foreground/50",
                        )}
                      >
                        {row.lane}
                      </span>
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span
                          className={cn(
                            "truncate text-sm font-medium",
                            !entry && "font-normal text-muted-foreground",
                          )}
                        >
                          {entry ? index.entryLabel(entry) : "Empty"}
                        </span>
                        {entry || flag ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {entry?.teamCode}
                            {flag ? (
                              <span
                                className={cn(
                                  "ml-2 text-amber-600 dark:text-amber-400",
                                  serious &&
                                    "text-destructive dark:text-destructive",
                                )}
                              >
                                {FLAG_TEXT[flag]}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </td>
                  <td className="font-mono text-sm tabular-nums">
                    {placeText(row)}
                  </td>
                  <td className="text-right font-mono text-sm tabular-nums">
                    {thousandths(row.timer?.finalMs)}
                  </td>
                  <td className="text-right font-mono text-sm tabular-nums">
                    {thousandths(result?.backupMs ?? row.timer?.backupMs)}
                  </td>
                  <td>
                    {result ? (
                      <TimeInput
                        key={`${result.timeMs}:${result.source}`}
                        lane={row.lane}
                        timeMs={result.timeMs}
                        onFocus={() => setSelected(row.lane)}
                        onNext={() => focusLaneAfter(row.lane)}
                        onChange={(timeMs) =>
                          edit(row.lane, {
                            timeMs,
                            source: "manual",
                            status:
                              timeMs && result.status === "ns"
                                ? "ok"
                                : result.status,
                          })
                        }
                      />
                    ) : null}
                  </td>
                  <td className="flex items-center gap-1.5">
                    {result ? (
                      <>
                        <NativeSelect
                          aria-label={`Lane ${row.lane} status`}
                          className={cn(
                            "min-w-0 flex-1",
                            !hasRace &&
                              result.timeMs == null &&
                              result.status === "ns" &&
                              "opacity-50",
                          )}
                          value={result.status}
                          onChange={(e) =>
                            edit(row.lane, {
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
                            aria-label={`Lane ${row.lane} DQ code`}
                            placeholder="Code"
                            defaultValue={result.dqCode ?? ""}
                            maxLength={4}
                            className="h-7 w-14 px-1.5 font-mono uppercase"
                            onBlur={(e) =>
                              edit(row.lane, {
                                dqCode:
                                  e.currentTarget.value.trim().toUpperCase() ||
                                  undefined,
                              })
                            }
                          />
                        ) : null}
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">
          The console didn't say which event and heat this was. Pick it above;
          later races follow on automatically.
        </p>
      )}

      {error ? (
        <p className="shrink-0 border-t px-4 py-1.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {lane && review ? (
        <LaneDetail
          lane={lane}
          result={edits.get(lane.lane)}
          onUseBackup={(result) =>
            edit(lane.lane, {
              timeMs: result.backupMs,
              source: "backup",
              status: result.status === "ns" ? "ok" : result.status,
            })
          }
        />
      ) : null}
    </div>
  );
}

function LaneDetail({
  lane,
  result,
  onUseBackup,
}: {
  lane: HeatReview["lanes"][number];
  result: LaneResult | undefined;
  onUseBackup: (result: LaneResult) => void;
}) {
  const splits = lane.timer?.splitsMs ?? [];
  const buttons = lane.timer?.buttonsMs.filter((b) => b != null) ?? [];
  const exchanges = lane.timer?.relayExchangesMs ?? [];
  const source =
    result?.source === "backup"
      ? "Backup"
      : result?.source === "manual"
        ? "Typed in"
        : "Touchpad";
  return (
    <section
      aria-label={`Lane ${lane.lane} details`}
      className="flex min-h-14 shrink-0 items-center gap-6 overflow-x-auto border-t px-4 py-1.5 text-sm"
    >
      <Detail label={`Lane ${lane.lane}`}>
        {result?.timeMs ? `Official from ${source.toLowerCase()}` : "No time"}
      </Detail>
      {result &&
      result.backupMs != null &&
      result.source !== "backup" &&
      lane.flags.length > 0 ? (
        <Button size="sm" variant="outline" onClick={() => onUseBackup(result)}>
          Use backup time
        </Button>
      ) : null}
      {lane.flags.length > 0 ? (
        <Detail label="Check">
          {lane.flags.map((flag) => FLAG_TEXT[flag]).join(". ")}
        </Detail>
      ) : null}
      {splits.length > 1 ? (
        <Detail label="Splits">
          <span className="flex gap-3 font-mono tabular-nums">
            {splits.map((s, i) => (
              <span key={i}>{s == null ? "—" : displayTime(s)}</span>
            ))}
          </span>
        </Detail>
      ) : null}
      {buttons.length > 0 ? (
        <Detail label="Buttons">
          <span className="flex gap-3 font-mono tabular-nums">
            {buttons.map((b, i) => (
              <span key={i}>{thousandths(b)}</span>
            ))}
          </span>
        </Detail>
      ) : null}
      {exchanges.length > 0 ? (
        <Detail label="Exchanges">
          <span className="flex gap-3 font-mono tabular-nums">
            {exchanges.map((x, i) => (
              <span key={i}>{(x / 1000).toFixed(2)}</span>
            ))}
          </span>
        </Detail>
      ) : null}
    </section>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="shrink-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="whitespace-nowrap">{children}</div>
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
              E{ev.number} {eventTitle(ev)}
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
  lane,
  timeMs,
  onChange,
  onFocus,
  onNext,
}: {
  lane: number;
  timeMs: number | null;
  onChange: (ms: number | null) => void;
  onFocus: () => void;
  onNext: () => void;
}) {
  const [invalid, setInvalid] = useState(false);
  return (
    <Input
      aria-label={`Lane ${lane} official time`}
      aria-invalid={invalid || undefined}
      data-lane-time={lane}
      defaultValue={timeMs ? displayTime(timeMs) : ""}
      placeholder="m:ss.hh"
      className="h-7 px-1.5 font-mono tabular-nums"
      onFocus={onFocus}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          onNext();
        }
      }}
      onBlur={(e) => {
        const text = e.currentTarget.value.trim();
        if (!text) {
          setInvalid(false);
          if (timeMs != null) onChange(null);
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
