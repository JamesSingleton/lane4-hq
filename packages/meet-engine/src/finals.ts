/**
 * Prelims → finals. The fastest prelim swimmers (by place, to the hundredth)
 * go to the A final, the next block to the B final, and so on. The A final
 * swims last; each final is seeded center-out by prelim time. A tie across
 * the last qualifying spot needs a swim-off before finals can be built.
 */
import { compareEventOrder, touch } from "./create";
import { toHundredths } from "./labels";
import {
  type Entry,
  type Heat,
  type IdFactory,
  type Meet,
  type MeetEvent,
  randomId,
} from "./model";
import { eventHasResults, laneOrder } from "./seeding";
import { eventProgress, eventStandings, type StandingRow } from "./standings";

export type FinalsOptions = {
  /** Finals to swim: 1 = A only, 2 = A/B, 3 = A/B/C. Default 1. */
  finalHeats?: number;
  /**
   * Prelim entries kept out of finals: swim-off losers or declared false
   * starts. Scratches from an earlier build of the finals are kept out too.
   */
  exclude?: string[];
};

export type FinalsPlan = {
  prelimEventId: string;
  capacity: number;
  /** Qualifiers in prelim order, fastest first. */
  qualifiers: StandingRow[];
  /** Swimmers tied across the last qualifying place; resolve by swim-off. */
  swimOff: StandingRow[];
  /** Next swimmers up if a finalist scratches. */
  alternates: StandingRow[];
};

export function finalsEventFor(
  meet: Meet,
  prelimEventId: string,
): MeetEvent | undefined {
  return meet.events.find((e) => e.prelimEventId === prelimEventId);
}

function prelimEvent(meet: Meet, prelimEventId: string): MeetEvent {
  const prelim = meet.events.find((e) => e.id === prelimEventId);
  if (prelim?.round !== "prelim") throw new Error("That isn't a prelim event.");
  return prelim;
}

/** Who makes finals, without changing the meet. */
export function finalsPlan(
  meet: Meet,
  prelimEventId: string,
  options: FinalsOptions = {},
): FinalsPlan {
  prelimEvent(meet, prelimEventId);
  const finalHeats = options.finalHeats ?? 1;
  if (!Number.isInteger(finalHeats) || finalHeats < 1 || finalHeats > 3) {
    throw new RangeError("Swim 1, 2, or 3 finals.");
  }
  const excluded = new Set(options.exclude ?? []);
  const existing = finalsEventFor(meet, prelimEventId);
  for (const e of meet.entries) {
    if (e.eventId === existing?.id && e.scratched && e.sourceEntryId) {
      excluded.add(e.sourceEntryId);
    }
  }

  const candidates = eventStandings(meet, prelimEventId).filter(
    (row) => row.place != null && !excluded.has(row.entry.id),
  );
  const capacity = finalHeats * meet.poolLanes;
  let qualifiers = candidates.slice(0, capacity);
  let swimOff: StandingRow[] = [];
  const cut = candidates[capacity - 1];
  if (cut && candidates[capacity]?.place === cut.place) {
    swimOff = candidates.filter((row) => row.place === cut.place);
    qualifiers = candidates.filter((row) => row.place! < cut.place!);
  }
  const taken = qualifiers.length + swimOff.length;
  return {
    prelimEventId,
    capacity,
    qualifiers,
    swimOff,
    alternates: candidates.slice(taken, taken + 2),
  };
}

/** Seed finals: group `lanes` at a time, A final as the last heat. */
export function seedFinals(
  eventId: string,
  entries: Entry[],
  lanes: number,
): Heat[] {
  const order = laneOrder(lanes);
  const groups = Math.ceil(entries.length / lanes);
  const heats: Heat[] = [];
  for (let g = 0; g < groups; g++) {
    const group = entries.slice(g * lanes, (g + 1) * lanes);
    heats.push({
      eventId,
      number: groups - g,
      lanes: group
        .map((entry, i) => ({ lane: order[i]!, entryId: entry.id }))
        .sort((a, b) => a.lane - b.lane),
    });
  }
  return heats.sort((a, b) => a.number - b.number);
}

/**
 * Build (or rebuild) the finals for a prelim event from its results. Every
 * prelim heat must be verified and there must be no swim-off pending.
 * Rebuilding refills scratched finalists from the alternates; it's refused
 * once any finals heat has results.
 */
export function createFinals(
  meet: Meet,
  prelimEventId: string,
  options: FinalsOptions & { newId?: IdFactory; now?: Date } = {},
): { meet: Meet; finalEventId: string; plan: FinalsPlan } {
  const prelim = prelimEvent(meet, prelimEventId);
  const progress = eventProgress(meet, prelimEventId);
  if (progress.heats === 0 || progress.state !== "complete") {
    throw new Error("Verify every prelim heat before building finals.");
  }
  const existing = finalsEventFor(meet, prelimEventId);
  if (existing && eventHasResults(meet, existing.id)) {
    throw new Error("Finals already have results; they can't be rebuilt.");
  }
  const plan = finalsPlan(meet, prelimEventId, options);
  if (plan.swimOff.length > 0) {
    throw new Error("A swim-off is needed for the last finals spot.");
  }
  if (plan.qualifiers.length === 0) {
    throw new Error("No one finished the prelims; there's no final to swim.");
  }

  const newId = options.newId ?? randomId;
  const groups = Math.ceil(plan.qualifiers.length / meet.poolLanes);
  const finals: MeetEvent = {
    ...(existing ?? {
      id: newId(),
      number: prelim.number,
      distance: prelim.distance,
      stroke: prelim.stroke,
      gender: prelim.gender,
      ageGroup: prelim.ageGroup,
      isRelay: prelim.isRelay,
      kind: prelim.kind,
    }),
    round: "final",
    prelimEventId,
    finalHeats: groups,
  };

  const previous = meet.entries.filter((e) => e.eventId === finals.id);
  const reuse = new Map(previous.map((e) => [e.sourceEntryId, e.id]));
  const qualifying = plan.qualifiers.map(
    ({ entry, result }): Entry => ({
      ...entry,
      id: reuse.get(entry.id) ?? newId(),
      eventId: finals.id,
      seedTimeMs: toHundredths(result.timeMs!),
      scratched: false,
      sourceEntryId: entry.id,
    }),
  );
  const qualifyingIds = new Set(qualifying.map((e) => e.id));
  const scratched = previous.filter(
    (e) => e.scratched && !qualifyingIds.has(e.id),
  );

  const next = touch(
    {
      ...meet,
      events: [...meet.events.filter((e) => e.id !== finals.id), finals].sort(
        compareEventOrder,
      ),
      entries: [
        ...meet.entries.filter((e) => e.eventId !== finals.id),
        ...qualifying,
        ...scratched,
      ],
      heats: [
        ...meet.heats.filter((h) => h.eventId !== finals.id),
        ...seedFinals(finals.id, qualifying, meet.poolLanes),
      ],
    },
    options.now,
  );
  return { meet: next, finalEventId: finals.id, plan };
}
