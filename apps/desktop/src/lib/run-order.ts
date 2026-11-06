import type { HeatReview } from "@lane4hq/meet-engine/adjudicate";
import {
  heatKey,
  type LaneResult,
  type Meet,
  type MeetEvent,
  type TimerCapture,
} from "@lane4hq/meet-engine/model";
import { runsEvent } from "@lane4hq/meet-engine/pools";
import { heatsForEvent } from "@lane4hq/meet-engine/seeding";
import { teamScores } from "@lane4hq/meet-engine/standings";

export type HeatPosition = { eventId: string; heat: number };

/** `ready` means the console has a race for this heat waiting to be verified. */
export type HeatState = "waiting" | "ready" | "verified";

export type RunEvent = {
  event: MeetEvent;
  heats: Array<{ number: number; state: HeatState }>;
};

function isHeat(capture: TimerCapture, position: HeatPosition): boolean {
  return (
    capture.assignment?.eventId === position.eventId &&
    capture.assignment.heat === position.heat
  );
}

/** Races on this heat, newest first. Ignored races don't count. */
export function heatCaptures(
  meet: Meet,
  position: HeatPosition,
): TimerCapture[] {
  return meet.captures
    .filter((c) => c.state !== "ignored" && isHeat(c, position))
    .reverse();
}

function heatState(meet: Meet, position: HeatPosition): HeatState {
  if (meet.heatRecords[heatKey(position.eventId, position.heat)]) {
    return "verified";
  }
  const waiting = heatCaptures(meet, position).some((c) => c.state === "new");
  return waiting ? "ready" : "waiting";
}

/** This computer's seeded events in meet order. Split meets show one pool. */
export function runOrder(meet: Meet): RunEvent[] {
  return meet.events.flatMap((event) => {
    if (!runsEvent(meet, event.id)) return [];
    const heats = heatsForEvent(meet, event.id).map(({ number }) => ({
      number,
      state: heatState(meet, { eventId: event.id, heat: number }),
    }));
    return heats.length > 0 ? [{ event, heats }] : [];
  });
}

function positions(meet: Meet): HeatPosition[] {
  return runOrder(meet).flatMap(({ event, heats }) =>
    heats.map(({ number }) => ({ eventId: event.id, heat: number })),
  );
}

/** The heat before or after this one, across events. */
export function stepHeat(
  meet: Meet,
  from: HeatPosition,
  direction: 1 | -1,
): HeatPosition | null {
  const all = positions(meet);
  const at = all.findIndex(
    (p) => p.eventId === from.eventId && p.heat === from.heat,
  );
  return at === -1 ? null : (all[at + direction] ?? null);
}

/** Where to start: the first heat not yet verified, or else the last heat. */
export function firstOpenHeat(meet: Meet): HeatPosition | null {
  const all = positions(meet);
  const open = all.find((p) => heatState(meet, p) !== "verified");
  return open ?? all[all.length - 1] ?? null;
}

/** The oldest race waiting for review that isn't on this heat. */
export function nextWaitingRace(
  meet: Meet,
  position: HeatPosition | null,
): TimerCapture | null {
  const waiting = meet.captures.filter(
    (c) => c.state === "new" && !(position && isHeat(c, position)),
  );
  return waiting[0] ?? null;
}

/** A review with a row for every lane in the pool, swum or empty. */
export function withEveryLane(meet: Meet, review: HeatReview): HeatReview {
  const byLane = new Map(review.lanes.map((l) => [l.lane, l]));
  const count = Math.max(meet.poolLanes, ...byLane.keys());
  const lanes = Array.from({ length: count }, (_, i) => {
    const lane = i + 1;
    return (
      byLane.get(lane) ?? {
        lane,
        entryId: null,
        timer: null,
        result: null,
        flags: [],
      }
    );
  });
  return { ...review, lanes };
}

/**
 * What a heat opens with. A verified heat shows its official results, so
 * reopening it can't undo a DQ or a corrected time.
 */
export function initialResults(
  meet: Meet,
  review: HeatReview,
): Map<number, LaneResult> {
  const official = meet.heatRecords[heatKey(review.eventId, review.heat)];
  const edits = new Map<number, LaneResult>();
  for (const lane of review.lanes) {
    if (!lane.result) continue;
    const kept = official
      ? meet.results.find((r) => r.entryId === lane.entryId)
      : undefined;
    edits.set(lane.lane, kept ?? lane.result);
  }
  return edits;
}

/** A heat with no race can only be verified once someone has entered results. */
export function canVerify(
  results: Iterable<LaneResult>,
  hasRace: boolean,
): boolean {
  const lanes = [...results];
  if (lanes.length === 0) return false;
  return hasRace || lanes.some((r) => r.timeMs != null || r.status !== "ns");
}

export type Scoreboard = {
  columns: string[];
  rows: Array<{ teamCode: string; points: number[] }>;
};

/** Team points by gender, since high school meets score those separately. */
export function scoreboard(meet: Meet): Scoreboard {
  const total = teamScores(meet);
  if (!total.some((t) => t.points > 0)) return { columns: [], rows: [] };
  const hasGender = (gender: MeetEvent["gender"]) =>
    meet.events.some((e) => e.gender === gender);
  const split = hasGender("female") && hasGender("male");
  if (!split) {
    return {
      columns: ["Points"],
      rows: total.map((t) => ({ teamCode: t.teamCode, points: [t.points] })),
    };
  }
  const girls = teamScores(meet, { gender: "female" });
  const boys = teamScores(meet, { gender: "male" });
  const points = (scores: typeof total, teamCode: string) =>
    scores
      .filter((s) => s.teamCode === teamCode)
      .reduce((sum, s) => sum + s.points, 0);
  return {
    columns: ["Girls", "Boys", "Total"],
    rows: total.map((t) => ({
      teamCode: t.teamCode,
      points: [points(girls, t.teamCode), points(boys, t.teamCode), t.points],
    })),
  };
}
