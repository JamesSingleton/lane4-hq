import { toHex } from "@lane4hq/timing-cts/frame";
import type { TimerLane, TimerRace } from "@lane4hq/timing-cts/race";
import { touch } from "./create";
import { eventLengths, indexMeet } from "./labels";
import {
  heatKey,
  type IdFactory,
  type LaneResult,
  type Meet,
  randomId,
  type TimerCapture,
} from "./model";

export type ReviewFlag =
  /** Touchpad didn't register; the backup time was used. */
  | "no-pad-time"
  /** Pad and backup disagree by more than the tolerance. */
  | "pad-backup-mismatch"
  /** The console recorded a DQ for this lane. */
  | "timer-dq"
  /** A relay exchange registered as an early takeoff. */
  | "early-takeoff"
  /** Seeded swimmer with no time at all. */
  | "no-time"
  /** Time recorded in a lane with no swimmer seeded. */
  | "time-in-empty-lane";

export type AdjudicationOptions = {
  /** Pad vs backup difference that needs a human look, in ms. Default 300. */
  backupToleranceMs?: number;
  /** Relay exchange below this (ms) is an early takeoff. Default -30 (USA judging tolerance). */
  earlyTakeoffMs?: number;
};

export type LaneProposal = {
  lane: number;
  entryId: string | null;
  timer: TimerLane | null;
  /** What will be recorded if the operator accepts; null for an empty lane. */
  result: LaneResult | null;
  flags: ReviewFlag[];
};

export type HeatReview = {
  eventId: string;
  heat: number;
  captureId: string;
  lanes: LaneProposal[];
  /** Race-level problems (wrong distance, extra lanes, decode warnings). */
  warnings: string[];
};

/** Record a race pulled from the console. Captures are never deleted. */
export function addCapture(
  meet: Meet,
  input: { race: TimerRace; raw: Uint8Array; timerVersion?: string },
  options: { newId?: IdFactory; now?: Date } = {},
): { meet: Meet; capture: TimerCapture } {
  const now = options.now ?? new Date();
  const capture: TimerCapture = {
    id: (options.newId ?? randomId)(),
    capturedAt: now.toISOString(),
    timerVersion: input.timerVersion,
    rawHex: toHex(input.raw),
    race: input.race,
    assignment: suggestAssignment(meet, input.race),
    state: "new",
  };
  return {
    meet: touch({ ...meet, captures: [...meet.captures, capture] }, now),
    capture,
  };
}

/** Same race number and timer date means the same race pulled twice. */
export function findCapture(
  meet: Meet,
  race: Pick<TimerRace, "raceNumber" | "date">,
): TimerCapture | undefined {
  const date = JSON.stringify(race.date);
  return meet.captures.find(
    (c) =>
      c.race.raceNumber === race.raceNumber &&
      JSON.stringify(c.race.date) === date,
  );
}

/**
 * Where a race probably belongs. A titled race (event/heat on the console)
 * maps by event number; otherwise it follows the last assigned race.
 */
export function suggestAssignment(
  meet: Meet,
  race: Pick<TimerRace, "event" | "heat">,
): TimerCapture["assignment"] {
  if (race.event > 0) {
    // Prelims and finals share a number: take the round still being swum.
    const heat = Math.max(1, race.heat);
    const candidates = meet.events.filter(
      (e) => e.number === race.event && e.kind === "swim",
    );
    const open = candidates.find(
      (e) =>
        meet.heats.some((h) => h.eventId === e.id && h.number === heat) &&
        !meet.heatRecords[heatKey(e.id, heat)],
    );
    const event = open ?? candidates[0];
    if (event) return { eventId: event.id, heat };
  }
  const last = [...meet.captures]
    .reverse()
    .find((c) => c.assignment && c.state !== "ignored");
  if (!last?.assignment) return firstUnswumHeat(meet);
  return nextHeat(meet, last.assignment);
}

function firstUnswumHeat(meet: Meet): TimerCapture["assignment"] {
  for (const event of meet.events) {
    if (event.kind !== "swim") continue;
    const heats = meet.heats
      .filter((h) => h.eventId === event.id)
      .sort((a, b) => a.number - b.number);
    for (const heat of heats) {
      if (!meet.heatRecords[heatKey(event.id, heat.number)]) {
        return { eventId: event.id, heat: heat.number };
      }
    }
  }
  return null;
}

/** The heat after `from`, rolling over to heat 1 of the next seeded event. */
export function nextHeat(
  meet: Meet,
  from: { eventId: string; heat: number },
): TimerCapture["assignment"] {
  const heats = meet.heats.filter((h) => h.eventId === from.eventId);
  if (heats.some((h) => h.number === from.heat + 1)) {
    return { eventId: from.eventId, heat: from.heat + 1 };
  }
  const index = meet.events.findIndex((e) => e.id === from.eventId);
  for (const event of meet.events.slice(index + 1)) {
    if (event.kind !== "swim") continue;
    const first = meet.heats
      .filter((h) => h.eventId === event.id)
      .sort((a, b) => a.number - b.number)[0];
    if (first) return { eventId: event.id, heat: first.number };
  }
  return null;
}

export function assignCapture(
  meet: Meet,
  captureId: string,
  assignment: TimerCapture["assignment"],
  now?: Date,
): Meet {
  return touch(
    {
      ...meet,
      captures: meet.captures.map((c) =>
        c.id === captureId
          ? { ...c, assignment, state: c.state === "ignored" ? "new" : c.state }
          : c,
      ),
    },
    now,
  );
}

export function ignoreCapture(meet: Meet, captureId: string, now?: Date): Meet {
  return touch(
    {
      ...meet,
      captures: meet.captures.map((c) =>
        c.id === captureId ? { ...c, state: "ignored" } : c,
      ),
    },
    now,
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Backup time: the backup field, or the median of the button times. */
export function backupTime(lane: TimerLane): number | null {
  if (lane.backupMs != null) return lane.backupMs;
  return median(lane.buttonsMs.filter((t): t is number => t != null));
}

/** Build the review for a captured race against the heat it's assigned to. */
export function reviewCapture(
  meet: Meet,
  capture: TimerCapture,
  options: AdjudicationOptions = {},
): HeatReview {
  if (!capture.assignment) throw new Error("Assign the race to a heat first.");
  const { eventId, heat } = capture.assignment;
  const tolerance = options.backupToleranceMs ?? 300;
  const early = options.earlyTakeoffMs ?? -30;
  const index = indexMeet(meet);
  const event = index.event(eventId);
  if (!event) throw new Error("The assigned event no longer exists.");

  const warnings: string[] = [];
  if (capture.race.layoutWarning) warnings.push(capture.race.layoutWarning);
  const expectedLengths = eventLengths(event, meet.course);
  if (
    capture.race.raceLengths &&
    capture.race.raceLengths !== expectedLengths
  ) {
    warnings.push(
      `Console ran ${capture.race.raceLengths} lengths; event ${event.number} is ${expectedLengths}.`,
    );
  }
  if (capture.race.event > 0 && capture.race.event !== event.number) {
    warnings.push(
      `Console titled this race event ${capture.race.event}, heat ${capture.race.heat}.`,
    );
  }

  const seeded = meet.heats.find(
    (h) => h.eventId === eventId && h.number === heat,
  );
  const entryByLane = new Map(
    seeded?.lanes.map((l) => [l.lane, l.entryId]) ?? [],
  );
  const timerByLane = new Map(capture.race.lanes.map((l) => [l.lane, l]));
  const laneCount = Math.max(meet.poolLanes, capture.race.lanesInPool);

  const lanes: LaneProposal[] = [];
  for (let lane = 1; lane <= laneCount; lane++) {
    const entryId = entryByLane.get(lane) ?? null;
    const timer = timerByLane.get(lane) ?? null;
    const flags: ReviewFlag[] = [];
    const pad = timer?.finalMs ?? null;
    const backup = timer ? backupTime(timer) : null;

    if (!entryId) {
      if (pad != null || (timer?.place ?? 0) > 0)
        flags.push("time-in-empty-lane");
      lanes.push({ lane, entryId: null, timer, result: null, flags });
      continue;
    }

    let timeMs = pad;
    let source: LaneResult["source"] = "pad";
    if (pad == null && backup != null) {
      timeMs = backup;
      source = "backup";
      flags.push("no-pad-time");
    } else if (
      pad != null &&
      backup != null &&
      Math.abs(pad - backup) > tolerance
    ) {
      flags.push("pad-backup-mismatch");
    }
    const exchanges = timer?.relayExchangesMs ?? [];
    if (event.isRelay && exchanges.some((x) => x < early))
      flags.push("early-takeoff");

    let status: LaneResult["status"] = "ok";
    if (timer?.status === "dq") {
      status = "dq";
      flags.push("timer-dq");
    } else if (timeMs == null) {
      status = "ns";
      flags.push("no-time");
    }

    const splitsMs = (timer?.splitsMs ?? []).filter(
      (t): t is number => t != null,
    );
    lanes.push({
      lane,
      entryId,
      timer,
      flags,
      result: {
        entryId,
        eventId,
        heat,
        lane,
        status,
        timeMs,
        source,
        splitsMs,
        backupMs: backup,
        buttonsMs: (timer?.buttonsMs ?? []).filter(
          (t): t is number => t != null,
        ),
        relayExchangesMs: exchanges,
        captureId: capture.id,
      },
    });
  }
  return { eventId, heat, captureId: capture.id, lanes, warnings };
}

/** An empty review for hand-timed or manually keyed heats. */
export function manualReview(
  meet: Meet,
  eventId: string,
  heat: number,
): HeatReview {
  const seeded = meet.heats.find(
    (h) => h.eventId === eventId && h.number === heat,
  );
  const lanes: LaneProposal[] = (seeded?.lanes ?? []).map(
    ({ lane, entryId }) => {
      const existing = meet.results.find((r) => r.entryId === entryId);
      return {
        lane,
        entryId,
        timer: null,
        flags: [],
        result: existing ?? {
          entryId,
          eventId,
          heat,
          lane,
          status: "ns",
          timeMs: null,
          source: "manual",
          splitsMs: [],
          backupMs: null,
          buttonsMs: [],
          relayExchangesMs: [],
        },
      };
    },
  );
  return { eventId, heat, captureId: "", lanes, warnings: [] };
}

/**
 * Make a heat official. Replaces any earlier results for the heat, bumps its
 * revision, and queues it for publishing.
 */
export function verifyHeat(
  meet: Meet,
  review: { eventId: string; heat: number; captureId?: string },
  results: LaneResult[],
  now: Date = new Date(),
): Meet {
  for (const r of results) {
    if (r.eventId !== review.eventId || r.heat !== review.heat) {
      throw new Error("Every result must belong to the heat being verified.");
    }
    if (r.status === "ok" && r.dive == null && !(r.timeMs && r.timeMs > 0)) {
      throw new Error(`Lane ${r.lane} is marked finished but has no time.`);
    }
  }
  const key = heatKey(review.eventId, review.heat);
  const previous = meet.heatRecords[key];
  const entryIds = new Set(results.map((r) => r.entryId));
  const kept = meet.results.filter(
    (r) =>
      !(r.eventId === review.eventId && r.heat === review.heat) &&
      !entryIds.has(r.entryId),
  );
  return touch(
    {
      ...meet,
      results: [...kept, ...results],
      captures: meet.captures.map((c) =>
        c.id === review.captureId ? { ...c, state: "verified" } : c,
      ),
      heatRecords: {
        ...meet.heatRecords,
        [key]: {
          verifiedAt: now.toISOString(),
          revision: (previous?.revision ?? 0) + 1,
          publish: {
            state: "pending",
            attempts: 0,
            publishedRevision: previous?.publish.publishedRevision,
          },
        },
      },
    },
    now,
  );
}
