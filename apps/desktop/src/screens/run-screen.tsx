import {
  assignCapture,
  type HeatReview,
  ignoreCapture,
  manualReview,
  nextHeat,
  reviewCapture,
  suggestAssignment,
  verifyHeat,
} from "@lane4hq/meet-engine/adjudicate";
import { eventTitle, heatLabel } from "@lane4hq/meet-engine/labels";
import type { LaneResult, TimerCapture } from "@lane4hq/meet-engine/model";
import { Badge } from "@lane4hq/ui/components/badge";
import { Button } from "@lane4hq/ui/components/button";
import { cn } from "@lane4hq/ui/lib/utils";
import { Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DivingPanel } from "../components/diving-panel";
import { ReviewPanel } from "../components/review-panel";
import { TimerBar } from "../components/timer-bar";
import {
  firstOpenHeat,
  type HeatPosition,
  type HeatState,
  heatCaptures,
  nextWaitingRace,
  runOrder,
  scoreboard,
  stepHeat,
  withEveryLane,
} from "../lib/run-order";
import { simulateHeat } from "../lib/simulate-heat";
import { useMeet } from "../state/meet-context";
import { useTiming } from "../state/timing-context";

type Selection = {
  position: HeatPosition | null;
  /** A specific race, when it isn't simply the newest one on the heat. */
  captureId: string | null;
};

function sameHeat(a: HeatPosition | null, b: HeatPosition | null): boolean {
  return a?.eventId === b?.eventId && a?.heat === b?.heat;
}

export function RunScreen() {
  const {
    state: { meet, saveState },
    actions: { update },
  } = useMeet();
  const {
    state: { lastCaptureId },
    meta: { simulator },
  } = useTiming();
  const [selection, setSelection] = useState<Selection>(() => ({
    position: firstOpenHeat(meet),
    captureId: null,
  }));
  const [tab, setTab] = useState<"events" | "races">("events");
  const drafts = useRef(new Map<string, Map<number, LaneResult>>());

  const picked = selection.captureId
    ? meet.captures.find((c) => c.id === selection.captureId)
    : undefined;
  const position = picked?.assignment ?? selection.position;
  const capture =
    picked ?? (position ? heatCaptures(meet, position)[0] : undefined);

  function open(next: HeatPosition | null) {
    setSelection({ position: next, captureId: null });
  }

  function openRace(race: TimerCapture) {
    setTab(race.assignment ? "events" : "races");
    setSelection({ position: race.assignment, captureId: race.id });
  }

  // Follow the console, unless this heat has a race still waiting for review.
  useEffect(() => {
    if (!lastCaptureId) return;
    const race = meet.captures.find((c) => c.id === lastCaptureId);
    if (!race) return;
    const reviewing = capture?.state === "new" && capture.id !== race.id;
    if (!reviewing) openRace(race);
  }, [lastCaptureId]);

  const review: HeatReview | null = useMemo(() => {
    if (capture?.assignment) {
      const assigned = capture.assignment.eventId;
      return meet.events.some((e) => e.id === assigned)
        ? reviewCapture(meet, capture)
        : null;
    }
    if (capture || !position) return null;
    return withEveryLane(
      meet,
      manualReview(meet, position.eventId, position.heat),
    );
  }, [meet, position, capture]);

  const waiting = nextWaitingRace(meet, position);
  const unassigned = meet.captures.filter(
    (c) => c.state === "new" && !c.assignment,
  ).length;
  const event = position
    ? meet.events.find((e) => e.id === position.eventId)
    : undefined;
  const panelKey = `${capture?.id ?? "manual"}:${review?.eventId}:${review?.heat}`;
  const step = position
    ? (direction: 1 | -1) => {
        const next = stepHeat(meet, position, direction);
        if (next) open(next);
      }
    : null;

  return (
    <div className="flex h-full flex-col">
      {saveState.status === "error" ? (
        <p
          role="alert"
          className="shrink-0 bg-destructive/10 px-4 py-1.5 text-sm text-destructive"
        >
          Not saved: {saveState.message}
        </p>
      ) : null}
      <TimerBar />
      {simulator ? <SimulatorBar /> : null}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-44 shrink-0 flex-col border-r lg:w-60">
          <div className="flex shrink-0 gap-1 border-b p-1.5" role="tablist">
            <TabButton
              active={tab === "events"}
              onClick={() => setTab("events")}
            >
              Events
            </TabButton>
            <TabButton active={tab === "races"} onClick={() => setTab("races")}>
              Console races
              {unassigned ? (
                <Badge className="ml-1.5">{unassigned}</Badge>
              ) : null}
            </TabButton>
          </div>
          {tab === "events" ? (
            <EventList position={position} onOpen={open} />
          ) : (
            <ul className="min-h-0 flex-1 overflow-auto p-1">
              {meet.captures.length === 0 ? (
                <li className="p-3 text-sm text-muted-foreground">
                  Races appear here as they finish on the timing console.
                </li>
              ) : null}
              {[...meet.captures].reverse().map((c) => (
                <li key={c.id}>
                  <CaptureRow
                    capture={c}
                    selected={capture?.id === c.id}
                    onSelect={() => openRace(c)}
                  />
                </li>
              ))}
            </ul>
          )}
          <TeamScores />
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          {waiting ? <WaitingRace race={waiting} onOpen={openRace} /> : null}
          <div className="min-h-0 flex-1 overflow-auto">
            {event?.kind === "dive" && position ? (
              <DivingPanel
                key={event.id}
                eventId={event.id}
                onVerify={(results) =>
                  update((m) =>
                    verifyHeat(m, { eventId: event.id, heat: 1 }, results),
                  )
                }
              />
            ) : capture || position ? (
              <ReviewPanel
                key={panelKey}
                capture={capture ?? null}
                review={review}
                draft={drafts.current.get(panelKey)}
                onDraft={(edits) => drafts.current.set(panelKey, edits)}
                onStep={step}
                onAssign={(assignment) => {
                  if (!capture) return;
                  update((m) => assignCapture(m, capture.id, assignment));
                  setSelection({ position: assignment, captureId: capture.id });
                }}
                onIgnore={() => {
                  if (!capture) return;
                  update((m) => ignoreCapture(m, capture.id));
                  open(position);
                }}
                onVerify={(results) => {
                  if (!review) return;
                  const next = update((m) => verifyHeat(m, review, results));
                  drafts.current.delete(panelKey);
                  open(nextHeat(next, review) ?? review);
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-10 text-center">
                <div className="flex max-w-sm flex-col items-center gap-2">
                  <p className="text-sm font-medium">No heats yet</p>
                  <p className="text-sm text-muted-foreground">
                    Seed events on the Heat sheet, then connect the timing
                    console above.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex h-7 flex-1 items-center justify-center rounded-md text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "bg-muted font-medium text-foreground",
      )}
    >
      {children}
    </button>
  );
}

const HEAT_STATE_LABEL: Record<HeatState, string> = {
  waiting: "not swum",
  ready: "ready to verify",
  verified: "verified",
};

function EventList({
  position,
  onOpen,
}: {
  position: HeatPosition | null;
  onOpen: (position: HeatPosition) => void;
}) {
  const {
    state: { meet },
  } = useMeet();
  const events = useMemo(() => runOrder(meet), [meet]);
  const current = useRef<HTMLLIElement>(null);

  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest" });
  }, [position?.eventId]);

  if (events.length === 0) {
    return (
      <p className="min-h-0 flex-1 p-3 text-sm text-muted-foreground">
        Seeded events appear here in meet order.
      </p>
    );
  }
  return (
    <ul className="min-h-0 flex-1 overflow-auto p-1">
      {events.map(({ event, heats }) => {
        const here = position?.eventId === event.id;
        const firstOpen =
          heats.find((h) => h.state !== "verified") ?? heats[0]!;
        return (
          <li
            key={event.id}
            ref={here ? current : undefined}
            className={cn("rounded-md px-2 py-1.5", here && "bg-muted")}
          >
            <button
              type="button"
              aria-current={here ? "true" : undefined}
              onClick={() =>
                onOpen({ eventId: event.id, heat: firstOpen.number })
              }
              className="flex w-full items-baseline gap-2 rounded text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="w-6 shrink-0 text-right font-semibold tabular-nums">
                {event.number}
              </span>
              <span className="truncate">{eventTitle(event)}</span>
            </button>
            <div className="mt-1 flex flex-wrap gap-1 pl-8">
              {heats.map((heat) => {
                const open = sameHeat(position, {
                  eventId: event.id,
                  heat: heat.number,
                });
                return (
                  <button
                    key={heat.number}
                    type="button"
                    aria-label={`Event ${event.number}, heat ${heat.number}, ${HEAT_STATE_LABEL[heat.state]}`}
                    aria-current={open ? "true" : undefined}
                    title={`Heat ${heat.number}, ${HEAT_STATE_LABEL[heat.state]}`}
                    onClick={() =>
                      onOpen({ eventId: event.id, heat: heat.number })
                    }
                    className={cn(
                      "flex size-5 items-center justify-center rounded text-[11px] tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      heat.state === "waiting" &&
                        "border text-muted-foreground",
                      heat.state === "ready" &&
                        "bg-amber-500 font-medium text-black",
                      heat.state === "verified" &&
                        "bg-primary text-primary-foreground",
                      open &&
                        "ring-2 ring-foreground ring-offset-1 ring-offset-background",
                    )}
                  >
                    {heat.number}
                  </button>
                );
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TeamScores() {
  const {
    state: { meet },
  } = useMeet();
  const { columns, rows } = useMemo(() => scoreboard(meet), [meet]);
  if (rows.length === 0) return null;
  return (
    <table className="w-full shrink-0 border-t text-xs">
      <caption className="px-3 pt-2 text-left font-medium">Team scores</caption>
      <thead className="text-muted-foreground">
        <tr>
          <th scope="col" className="px-3 py-1 text-left font-normal">
            Team
          </th>
          {columns.map((column) => (
            <th
              key={column}
              scope="col"
              className="pr-3 text-right font-normal"
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {rows.slice(0, 6).map((row) => (
          <tr key={row.teamCode}>
            <th scope="row" className="px-3 pb-1 text-left font-medium">
              {row.teamCode}
            </th>
            {row.points.map((points, i) => (
              <td key={columns[i]} className="pr-3 pb-1 text-right">
                {points}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WaitingRace({
  race,
  onOpen,
}: {
  race: TimerCapture;
  onOpen: (race: TimerCapture) => void;
}) {
  const {
    state: { meet },
  } = useMeet();
  const event = race.assignment
    ? meet.events.find((e) => e.id === race.assignment!.eventId)
    : undefined;
  return (
    <div className="flex shrink-0 items-center gap-3 border-b bg-amber-500/10 px-4 py-1.5 text-sm">
      <span>
        Race {race.race.raceNumber} finished
        {event
          ? `: Event ${event.number}, ${heatLabel(event, race.assignment!.heat)}`
          : ", and it needs a heat"}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="ml-auto"
        onClick={() => onOpen(race)}
      >
        Load times
      </Button>
    </div>
  );
}

function CaptureRow({
  capture,
  selected,
  onSelect,
}: {
  capture: TimerCapture;
  selected: boolean;
  onSelect: () => void;
}) {
  const {
    state: { meet },
  } = useMeet();
  const event = capture.assignment
    ? meet.events.find((e) => e.id === capture.assignment!.eventId)
    : undefined;
  const d = capture.race.date;
  const time = d
    ? `${String(d.hours).padStart(2, "0")}:${String(d.minutes).padStart(2, "0")}`
    : "";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "bg-muted",
        capture.state === "ignored" && "opacity-50",
      )}
    >
      <span className="flex items-center gap-2 text-sm">
        <span className="font-mono tabular-nums">
          Race {capture.race.raceNumber}
        </span>
        <span className="text-xs text-muted-foreground">{time}</span>
        <span className="ml-auto">
          {capture.state === "new" ? (
            <Badge variant="secondary">Review</Badge>
          ) : capture.state === "verified" ? (
            <Badge>Verified</Badge>
          ) : (
            <Badge variant="outline">Ignored</Badge>
          )}
        </span>
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {event
          ? `E${event.number} ${heatLabel(event, capture.assignment!.heat, { short: true })} · ${eventTitle(event)}`
          : "Not assigned to a heat"}
      </span>
    </button>
  );
}

function SimulatorBar() {
  const {
    state: { meet },
  } = useMeet();
  const {
    actions: { pollNow },
    meta: { simulator },
  } = useTiming();
  const [titled, setTitled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const last = [...meet.captures]
    .reverse()
    .find((c) => c.assignment)?.assignment;
  const target = last
    ? nextHeat(meet, last)
    : suggestAssignment(meet, { event: 0, heat: 0 });
  const event = target
    ? meet.events.find((e) => e.id === target.eventId)
    : undefined;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-amber-500/5 px-4 py-2 text-sm">
      <Badge variant="outline">Simulator</Badge>
      <span className="hidden text-muted-foreground lg:inline">
        A pretend console for training and testing. Nothing here touches real
        timing.
      </span>
      <label className="ml-auto flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={titled}
          onChange={(e) => setTitled(e.currentTarget.checked)}
        />
        Console knows event/heat
      </label>
      <Button
        size="sm"
        disabled={!target || !simulator}
        onClick={async () => {
          try {
            setError(null);
            simulateHeat(simulator!, meet, target!, Date.now(), { titled });
            await pollNow();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        <Play />
        {event
          ? `Swim E${event.number} ${heatLabel(event, target!.heat, { short: true })}`
          : "No heats left"}
      </Button>
      {error ? (
        <span className="w-full text-xs text-destructive">{error}</span>
      ) : null}
    </div>
  );
}
