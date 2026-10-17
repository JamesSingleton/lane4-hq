/**
 * One-meter and three-meter diving as scored at high school and age-group
 * meets (NFHS / USA Diving): each judge awards 0–10 in half points, the
 * panel's high and low awards are dropped (5 judges: one each; 7 judges: two
 * each), and the remaining sum is multiplied by the degree of difficulty.
 */
import { touch } from "./create";
import { indexMeet } from "./labels";
import type { Dive, DiveCard, DiveJudges, LaneResult, Meet } from "./model";
import { eventHasResults } from "./seeding";

export const DIVE_JUDGE_PANELS: DiveJudges[] = [3, 5, 7];

const DROPPED: Record<DiveJudges, number> = { 3: 0, 5: 1, 7: 2 };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isValidAward(award: number): boolean {
  return (
    Number.isFinite(award) &&
    award >= 0 &&
    award <= 10 &&
    Number.isInteger(award * 2)
  );
}

/** Problems with a dive as entered, empty when it can be scored. */
export function diveProblems(dive: Dive, judges: DiveJudges): string[] {
  const problems: string[] = [];
  if (!dive.code.trim()) problems.push("Enter the dive number.");
  if (!(dive.dd > 0 && dive.dd <= 5)) {
    problems.push("Degree of difficulty must be between 0.1 and 5.0.");
  }
  if (!dive.failed) {
    if (dive.awards.length !== judges) {
      problems.push(`Enter ${judges} awards.`);
    } else if (!dive.awards.every(isValidAward)) {
      problems.push("Awards are 0–10 in half points.");
    }
  }
  return problems;
}

/** Score one dive; a failed dive is zero. */
export function scoreDive(dive: Dive, judges: DiveJudges): number {
  if (dive.failed) return 0;
  const problems = diveProblems(dive, judges);
  if (problems.length > 0) throw new RangeError(problems[0]);
  const drop = DROPPED[judges];
  const awards = dive.awards
    .map((a) => (dive.balk ? Math.max(0, a - 2) : a))
    .sort((a, b) => a - b)
    .slice(drop, judges - drop);
  const raw = awards.reduce((sum, a) => sum + a, 0);
  return round2(raw * dive.dd);
}

export function scoreCard(dives: Dive[], judges: DiveJudges): DiveCard {
  const total = dives.reduce((sum, d) => sum + scoreDive(d, judges), 0);
  return { dives, total: round2(total) };
}

export function diveSettings(
  meet: Meet,
  eventId: string,
): { diveCount: number; diveJudges: DiveJudges } {
  const event = indexMeet(meet).event(eventId);
  if (event?.kind !== "dive") throw new Error("That isn't a diving event.");
  return {
    diveCount: event.diveCount ?? 6,
    diveJudges: event.diveJudges ?? 3,
  };
}

export function setDiveSettings(
  meet: Meet,
  eventId: string,
  patch: { diveCount?: number; diveJudges?: DiveJudges },
  now?: Date,
): Meet {
  diveSettings(meet, eventId);
  if (patch.diveJudges != null && !DIVE_JUDGE_PANELS.includes(patch.diveJudges))
    throw new RangeError("Judging panels are 3, 5, or 7 judges.");
  if (
    patch.diveCount != null &&
    !(
      Number.isInteger(patch.diveCount) &&
      patch.diveCount >= 1 &&
      patch.diveCount <= 11
    )
  )
    throw new RangeError("A dive card has 1–11 dives.");
  if (eventHasResults(meet, eventId))
    throw new Error("This event already has scores.");
  return touch(
    {
      ...meet,
      events: meet.events.map((e) =>
        e.id === eventId ? { ...e, ...patch } : e,
      ),
    },
    now,
  );
}

/** A blank dive with one award slot per judge. */
export function blankDive(judges: DiveJudges): Dive {
  return {
    code: "",
    position: "B",
    dd: 0,
    awards: new Array<number>(judges).fill(0),
  };
}

/**
 * A diver's sheet, sized to the event: saved dives first, blanks after.
 * Award slots follow the current judging panel.
 */
export function diveSheet(
  meet: Meet,
  eventId: string,
  entryId: string,
): Dive[] {
  const { diveCount, diveJudges } = diveSettings(meet, eventId);
  const saved = meet.diveSheets?.[entryId] ?? [];
  return Array.from({ length: diveCount }, (_, i) => {
    const dive = saved[i] ?? blankDive(diveJudges);
    const awards = Array.from(
      { length: diveJudges },
      (_, j) => dive.awards[j] ?? 0,
    );
    return { ...dive, awards };
  });
}

export function saveDiveSheet(
  meet: Meet,
  eventId: string,
  entryId: string,
  dives: Dive[],
  now?: Date,
): Meet {
  const { diveCount } = diveSettings(meet, eventId);
  if (dives.length > diveCount) {
    throw new RangeError(`This event has ${diveCount} dives.`);
  }
  return touch(
    { ...meet, diveSheets: { ...meet.diveSheets, [entryId]: dives } },
    now,
  );
}

/** A dive counts toward the running total once it's failed or fully judged. */
export function isDiveScored(dive: Dive, judges: DiveJudges): boolean {
  return (
    dive.failed === true ||
    (diveProblems(dive, judges).length === 0 && dive.awards.some((a) => a > 0))
  );
}

/** Points so far: scored dives only, to the hundredth. */
export function runningTotal(dives: Dive[], judges: DiveJudges): number {
  const total = dives.reduce(
    (sum, d) => (isDiveScored(d, judges) ? sum + scoreDive(d, judges) : sum),
    0,
  );
  return round2(total);
}

/**
 * The result to verify for one diver. A card with every dive scored is
 * `ok`; `status` can mark a diver who didn't compete (`ns`) or was
 * disqualified (`dq`).
 */
export function diveResult(
  meet: Meet,
  seat: { eventId: string; heat: number; lane: number; entryId: string },
  dives: Dive[],
  status: LaneResult["status"] = "ok",
): LaneResult {
  const { diveCount, diveJudges } = diveSettings(meet, seat.eventId);
  if (status === "ok" && dives.length !== diveCount) {
    throw new RangeError(`Enter all ${diveCount} dives.`);
  }
  return {
    ...seat,
    status,
    timeMs: null,
    source: "manual",
    splitsMs: [],
    backupMs: null,
    buttonsMs: [],
    relayExchangesMs: [],
    dive: status === "ok" ? scoreCard(dives, diveJudges) : undefined,
  };
}
