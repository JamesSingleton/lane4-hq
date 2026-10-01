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
import { heatKey, type TimerCapture } from "@lane4hq/meet-engine/model";
import { heatsForEvent } from "@lane4hq/meet-engine/seeding";
import { Badge } from "@lane4hq/ui/components/badge";
import { Button } from "@lane4hq/ui/components/button";
import { cn } from "@lane4hq/ui/lib/utils";
import { Keyboard, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DivingPanel } from "../components/diving-panel";
import { NativeSelect } from "../components/native-select";
import { ReviewPanel } from "../components/review-panel";
import { TimerBar } from "../components/timer-bar";
import { simulateHeat } from "../lib/simulate-heat";
import { useMeet } from "../state/meet-context";
import { useTiming } from "../state/timing-context";

type Selection =
  | { kind: "capture"; id: string }
  | { kind: "manual"; eventId: string; heat: number }
  | null;

export function RunScreen() {
  const {
    state: { meet },
    actions: { update },
  } = useMeet();
  const {
    state: { lastCaptureId },
    meta: { simulator },
  } = useTiming();
  const [selection, setSelection] = useState<Selection>(() => {
    const open = [...meet.captures].reverse().find((c) => c.state === "new");
    return open ? { kind: "capture", id: open.id } : null;
  });

  // Follow the console: jump to each new race unless the operator is mid-review.
  useEffect(() => {
    if (!lastCaptureId) return;
    setSelection((current) => {
      if (current?.kind === "capture") {
        const c = meet.captures.find((x) => x.id === current.id);
        if (c?.state === "new") return current;
      }
      return { kind: "capture", id: lastCaptureId };
    });
  }, [lastCaptureId]);

  const capture =
    selection?.kind === "capture"
      ? meet.captures.find((c) => c.id === selection.id)
      : undefined;

  const review: HeatReview | null = useMemo(() => {
    if (selection?.kind === "manual")
      return manualReview(meet, selection.eventId, selection.heat);
    if (
      capture?.assignment &&
      meet.events.some((e) => e.id === capture.assignment!.eventId)
    ) {
      return reviewCapture(meet, capture);
    }
    return null;
  }, [meet, selection, capture]);

  const isDiveEvent = (eventId: string) =>
    meet.events.some((e) => e.id === eventId && e.kind === "dive");
  const captures = [...meet.captures].reverse();
  const pendingCount = meet.captures.filter((c) => c.state === "new").length;

  function selectNext() {
    const next = meet.captures.find(
      (c) => c.state === "new" && c.id !== capture?.id,
    );
    setSelection(next ? { kind: "capture", id: next.id } : null);
  }

  return (
    <div className="flex h-full flex-col">
      <TimerBar />
      {simulator ? <SimulatorBar /> : null}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h2 className="text-sm font-semibold">
              Races from the console
              {pendingCount ? (
                <Badge className="ml-2">{pendingCount} to review</Badge>
              ) : null}
            </h2>
          </div>
          <ManualEntryPicker
            onPick={(eventId, heat) =>
              setSelection({ kind: "manual", eventId, heat })
            }
          />
          <ul className="min-h-0 flex-1 overflow-auto p-1">
            {captures.length === 0 ? (
              <li className="p-3 text-sm text-muted-foreground">
                Races appear here as they finish on the timing console.
              </li>
            ) : null}
            {captures.map((c) => (
              <li key={c.id}>
                <CaptureRow
                  capture={c}
                  selected={
                    selection?.kind === "capture" && selection.id === c.id
                  }
                  onSelect={() => setSelection({ kind: "capture", id: c.id })}
                />
              </li>
            ))}
          </ul>
        </aside>
        <section className="min-w-0 flex-1 overflow-auto">
          {selection?.kind === "manual" && isDiveEvent(selection.eventId) ? (
            <DivingPanel
              key={selection.eventId}
              eventId={selection.eventId}
              onVerify={(results) =>
                update((m) =>
                  verifyHeat(
                    m,
                    { eventId: selection.eventId, heat: 1 },
                    results,
                  ),
                )
              }
            />
          ) : capture || selection?.kind === "manual" ? (
            <ReviewPanel
              key={`${selection?.kind === "capture" ? capture?.id : "manual"}:${review?.eventId}:${review?.heat}`}
              capture={capture ?? null}
              review={review}
              onAssign={(assignment) =>
                capture &&
                update((m) => assignCapture(m, capture.id, assignment))
              }
              onIgnore={() => {
                if (capture) update((m) => ignoreCapture(m, capture.id));
                selectNext();
              }}
              onVerify={(results) => {
                if (!review) return;
                update((m) => verifyHeat(m, review, results));
                selectNext();
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-10 text-center">
              <div className="flex max-w-sm flex-col items-center gap-2">
                <p className="text-sm font-medium">Nothing to review</p>
                <p className="text-sm text-muted-foreground">
                  Connect the timing console above. Each finished race is pulled
                  automatically; check it against the heat sheet and verify it
                  to make it official.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
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

function ManualEntryPicker({
  onPick,
}: {
  onPick: (eventId: string, heat: number) => void;
}) {
  const {
    state: { meet },
  } = useMeet();
  const options = meet.events.flatMap((event) =>
    heatsForEvent(meet, event.id).map((h) => ({ event, heat: h.number })),
  );
  if (options.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 border-b px-3 py-2">
      <Keyboard className="size-3.5 shrink-0 text-muted-foreground" />
      <NativeSelect
        aria-label="Enter a heat by hand"
        className="flex-1"
        value=""
        onChange={(e) => {
          const [eventId, heat] = e.currentTarget.value.split("|");
          if (eventId && heat) onPick(eventId, Number(heat));
        }}
      >
        <option value="">Enter a heat by hand…</option>
        {options.map(({ event, heat }) => (
          <option key={`${event.id}|${heat}`} value={`${event.id}|${heat}`}>
            E{event.number}{" "}
            {event.kind === "dive"
              ? "Scores"
              : heatLabel(event, heat, { short: true })}
            {meet.heatRecords[heatKey(event.id, heat)] ? " ✓" : ""} ·{" "}
            {eventTitle(event)}
          </option>
        ))}
      </NativeSelect>
    </div>
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
      <span className="text-muted-foreground">
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
