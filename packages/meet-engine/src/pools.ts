/**
 * Two pools, one meet. The meet is set up once, split into a girls pool and a
 * boys pool, and copied to a second machine. Each machine runs only its own
 * pool's events. At the end, either machine merges the other's copy: every
 * event belongs to exactly one pool, so each event's heats and results come
 * from the machine that ran it and nothing has to be reconciled.
 */
import type { EventGender } from "@lane4hq/swim-core/events";
import { normalizePersonName } from "@lane4hq/swim-core/people";
import { compareEventOrder, touch } from "./create";
import type { Athlete, Entry, Meet, Pool } from "./model";
import { eventPoolId } from "./pool-ownership";

export {
  assertRunsEvent,
  eventPoolId,
  localPool,
  runsEvent,
} from "./pool-ownership";

/** Fixed ids, so both copies of a meet agree on them. */
export const GIRLS_POOL_ID = "girls";
export const BOYS_POOL_ID = "boys";

/**
 * Split the meet into a girls pool and a boys pool, with this copy running
 * the girls pool. Mixed events start in the girls pool; move them (and
 * diving, if it has its own well) with `assignEventToPool`.
 */
export function splitByGender(meet: Meet, now?: Date): Meet {
  if (meet.split) return meet;
  const pools: Pool[] = [
    { id: GIRLS_POOL_ID, name: "Girls pool", genders: ["female", "mixed"] },
    { id: BOYS_POOL_ID, name: "Boys pool", genders: ["male"] },
  ];
  return touch(
    {
      ...meet,
      split: { pools, localPoolId: GIRLS_POOL_ID, assignments: {} },
    },
    now,
  );
}

/** Run the whole meet in one pool again. */
export function unsplitMeet(meet: Meet, now?: Date): Meet {
  if (!meet.split) return meet;
  const { split: _split, ...rest } = meet;
  return touch(rest, now);
}

function requirePool(meet: Meet, poolId: string): Pool {
  const pool = meet.split?.pools.find((p) => p.id === poolId);
  if (!pool) throw new Error("That pool isn't part of this meet.");
  return pool;
}

/** Which pool this computer runs. */
export function setLocalPool(meet: Meet, poolId: string, now?: Date): Meet {
  requirePool(meet, poolId);
  return touch(
    { ...meet, split: { ...meet.split!, localPoolId: poolId } },
    now,
  );
}

/**
 * Move an event to a pool by hand. Its finals follow it. Refused once the
 * event has results, since those were recorded in the pool it was in.
 */
export function assignEventToPool(
  meet: Meet,
  eventId: string,
  poolId: string,
  now?: Date,
): Meet {
  requirePool(meet, poolId);
  const event = meet.events.find((e) => e.id === eventId);
  if (!event) throw new Error("That event isn't in this meet.");
  if (event.round === "final") {
    throw new Error("A final swims in its prelim's pool. Move the prelim.");
  }
  if (meet.results.some((r) => r.eventId === eventId)) {
    throw new Error(
      `Event ${event.number} has results; it can't change pools.`,
    );
  }
  return touch(
    {
      ...meet,
      split: {
        ...meet.split!,
        assignments: { ...meet.split!.assignments, [eventId]: poolId },
      },
    },
    now,
  );
}

/** The ids of the events a pool runs, in this copy's view. */
export function poolEventIds(meet: Meet, poolId: string): Set<string> {
  return new Set(
    meet.events
      .filter((e) => eventPoolId(meet, e.id) === poolId)
      .map((e) => e.id),
  );
}

export type PossibleDuplicate = {
  teamCode: string;
  name: string;
  localAthleteId: string;
  otherAthleteId: string;
};

export type PoolMergeReport = {
  /** The pool whose results came in. */
  poolName: string;
  events: number;
  heats: number;
  results: number;
  athletesAdded: number;
  /** Swimmers both pools added on deck; check and fix by hand. */
  possibleDuplicates: PossibleDuplicate[];
  /** Events both copies run (one of them moved it); this copy's are kept. */
  claimedByBoth: number[];
};

function heatKeyEventId(key: string): string {
  return key.slice(0, key.lastIndexOf("#"));
}

function sameSwimmer(a: Athlete, b: Athlete): boolean {
  if (a.teamCode !== b.teamCode) return false;
  if (a.usaMemberId && b.usaMemberId) return a.usaMemberId === b.usaMemberId;
  const sameName =
    normalizePersonName(a.firstName) === normalizePersonName(b.firstName) &&
    normalizePersonName(a.lastName) === normalizePersonName(b.lastName);
  if (!sameName) return false;
  return !a.dateOfBirth || !b.dateOfBirth || a.dateOfBirth === b.dateOfBirth;
}

function entryAthleteIds(entry: Entry): string[] {
  return [
    ...(entry.athleteId ? [entry.athleteId] : []),
    ...(entry.relay?.legAthleteIds ?? []),
  ];
}

/**
 * Bring the other pool's results into this copy. `other` is the other
 * machine's copy of the same meet. For every event the other pool runs, its
 * events, entries, heats, results, dive sheets, heat records (with publish
 * state), and timer captures replace this copy's. This copy's own events
 * are untouched, and so is which pool it runs. Merging the same copy twice
 * gives the same meet.
 */
export function mergePoolCopy(
  local: Meet,
  other: Meet,
  now?: Date,
): { meet: Meet; report: PoolMergeReport } {
  if (local.id !== other.id) {
    throw new Error("That file is a different meet.");
  }
  if (!local.split || !other.split) {
    throw new Error(
      "Split the meet into pools on both computers before merging.",
    );
  }
  const otherPoolId = other.split.localPoolId;
  if (otherPoolId === local.split.localPoolId) {
    const name = local.split.pools.find((p) => p.id === otherPoolId)?.name;
    throw new Error(
      `Both copies run the ${name ?? "same pool"}. Set the other computer to its own pool first.`,
    );
  }
  const otherPool = local.split.pools.find((p) => p.id === otherPoolId);
  if (!otherPool) {
    throw new Error("The other copy runs a pool this meet doesn't have.");
  }

  const localPoolId = local.split.localPoolId;
  const claimedByBoth: number[] = [];
  const incoming = new Set<string>();
  for (const event of other.events) {
    if (eventPoolId(other, event.id) !== otherPoolId) continue;
    if (
      local.events.some((e) => e.id === event.id) &&
      eventPoolId(local, event.id) === localPoolId
    ) {
      claimedByBoth.push(event.number);
      continue;
    }
    incoming.add(event.id);
  }
  // Events this copy thinks the other pool runs: the other copy is the
  // authority on them, including ones it removed.
  const replaced = new Set(incoming);
  for (const id of poolEventIds(local, otherPoolId)) replaced.add(id);

  const keepLocal = <T extends { eventId: string }>(rows: T[]) =>
    rows.filter((row) => !replaced.has(row.eventId));
  const takeOther = <T extends { eventId: string }>(rows: T[]) =>
    rows.filter((row) => incoming.has(row.eventId));

  const entries = [...keepLocal(local.entries), ...takeOther(other.entries)];
  const keptEntryIds = new Set(entries.map((e) => e.id));
  const incomingEntryIds = new Set(takeOther(other.entries).map((e) => e.id));

  const diveSheets: NonNullable<Meet["diveSheets"]> = {};
  for (const [entryId, dives] of Object.entries(local.diveSheets ?? {})) {
    if (keptEntryIds.has(entryId) && !incomingEntryIds.has(entryId)) {
      diveSheets[entryId] = dives;
    }
  }
  for (const [entryId, dives] of Object.entries(other.diveSheets ?? {})) {
    if (incomingEntryIds.has(entryId)) diveSheets[entryId] = dives;
  }

  const heatRecords: Meet["heatRecords"] = {};
  for (const [key, record] of Object.entries(local.heatRecords)) {
    if (!replaced.has(heatKeyEventId(key))) heatRecords[key] = record;
  }
  let heats = 0;
  for (const [key, record] of Object.entries(other.heatRecords)) {
    if (incoming.has(heatKeyEventId(key))) {
      heatRecords[key] = record;
      heats++;
    }
  }

  const localCaptureIds = new Set(local.captures.map((c) => c.id));
  const captures = [
    ...local.captures,
    ...other.captures.filter(
      (c) =>
        !localCaptureIds.has(c.id) &&
        c.assignment != null &&
        incoming.has(c.assignment.eventId),
    ),
  ];

  const localAthleteIds = new Set(local.athletes.map((a) => a.id));
  const neededIds = new Set(
    takeOther(other.entries).flatMap((e) => entryAthleteIds(e)),
  );
  const added = other.athletes.filter(
    (a) => neededIds.has(a.id) && !localAthleteIds.has(a.id),
  );
  const possibleDuplicates: PossibleDuplicate[] = [];
  for (const athlete of added) {
    const twin = local.athletes.find((a) => sameSwimmer(a, athlete));
    if (twin) {
      possibleDuplicates.push({
        teamCode: athlete.teamCode,
        name: `${athlete.firstName} ${athlete.lastName}`,
        localAthleteId: twin.id,
        otherAthleteId: athlete.id,
      });
    }
  }

  const localTeams = new Set(local.teams.map((t) => t.code));
  const otherResults = takeOther(other.results);
  const assignments = { ...local.split.assignments };
  for (const [eventId, poolId] of Object.entries(other.split.assignments)) {
    if (incoming.has(eventId)) assignments[eventId] = poolId;
  }

  const meet = touch(
    {
      ...local,
      events: [
        ...local.events.filter((e) => !replaced.has(e.id)),
        ...other.events.filter((e) => incoming.has(e.id)),
      ].sort(compareEventOrder),
      teams: [
        ...local.teams,
        ...other.teams.filter((t) => !localTeams.has(t.code)),
      ],
      athletes: [...local.athletes, ...added],
      entries,
      heats: [...keepLocal(local.heats), ...takeOther(other.heats)],
      results: [...keepLocal(local.results), ...otherResults],
      captures,
      heatRecords,
      ...(Object.keys(diveSheets).length > 0 || local.diveSheets
        ? { diveSheets }
        : {}),
      split: { ...local.split, assignments },
    },
    now,
  );

  return {
    meet,
    report: {
      poolName: otherPool.name,
      events: incoming.size,
      heats,
      results: otherResults.length,
      athletesAdded: added.length,
      possibleDuplicates,
      claimedByBoth,
    },
  };
}

/** Boys, girls, or (undefined) both, for results files and scores. */
export type GenderFilter = Extract<EventGender, "female" | "male">;

export function genderLabel(gender: GenderFilter): "Girls" | "Boys" {
  return gender === "female" ? "Girls" : "Boys";
}
