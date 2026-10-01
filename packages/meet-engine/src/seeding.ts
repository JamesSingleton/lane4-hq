import { touch } from "./create";
import { indexMeet } from "./labels";
import type { Entry, Heat, Meet } from "./model";

/**
 * Seeding order for lanes, fastest first: the center lane, then alternating
 * outward. 6 lanes → 3 4 2 5 1 6; 8 → 4 5 3 6 2 7 1 8; 10 → 5 6 4 7 3 8 2 9 1 10.
 */
export function laneOrder(lanes: number): number[] {
  const center = Math.ceil(lanes / 2);
  const order = [center];
  for (let step = 1; order.length < lanes; step++) {
    if (center + step <= lanes) order.push(center + step);
    if (center - step >= 1 && order.length < lanes) order.push(center - step);
  }
  return order;
}

export type SeedOptions = {
  lanes: number;
  /**
   * Circle-seed this many of the fastest heats (prelims). 0 seeds straight
   * timed finals, fastest heat last.
   */
  circleHeats?: number;
  /** Minimum swimmers in the first (slowest) heat. USA Swimming: 3. */
  minFirstHeat?: number;
};

/** Faster seeds first; no-time entries last, in a stable order. */
export function compareSeeds(a: Entry, b: Entry): number {
  if (a.seedTimeMs == null && b.seedTimeMs == null) return 0;
  if (a.seedTimeMs == null) return 1;
  if (b.seedTimeMs == null) return -1;
  return a.seedTimeMs - b.seedTimeMs;
}

/** Heat sizes, slowest heat first. */
export function heatSizes(
  swimmers: number,
  lanes: number,
  minFirstHeat = 3,
): number[] {
  if (swimmers <= 0) return [];
  const heats = Math.ceil(swimmers / lanes);
  const sizes = new Array<number>(heats).fill(lanes);
  sizes[0] = swimmers - lanes * (heats - 1);
  if (heats > 1 && sizes[0]! < minFirstHeat) {
    const move = Math.min(minFirstHeat - sizes[0]!, sizes[1]! - minFirstHeat);
    if (move > 0) {
      sizes[0]! += move;
      sizes[1]! -= move;
    }
  }
  return sizes;
}

function placeInLanes(entries: Entry[], lanes: number): Heat["lanes"] {
  const order = laneOrder(lanes);
  return entries
    .map((entry, i) => ({ lane: order[i]!, entryId: entry.id }))
    .sort((a, b) => a.lane - b.lane);
}

/** Seed a list of entries into heats (numbered 1…n, slowest first). */
export function seedEntries(
  eventId: string,
  entries: Entry[],
  options: SeedOptions,
): Heat[] {
  const ranked = [...entries].sort(compareSeeds);
  const sizes = heatSizes(ranked.length, options.lanes, options.minFirstHeat);
  const buckets: Entry[][] = sizes.map(() => []);
  const circle = Math.min(options.circleHeats ?? 0, sizes.length);

  let cursor = 0;
  if (circle > 0) {
    // Fastest heats last: round-robin the top swimmers across them.
    const circleHeatIndexes = sizes
      .map((_, i) => i)
      .slice(sizes.length - circle)
      .reverse();
    const capacity = circleHeatIndexes.reduce((n, i) => n + sizes[i]!, 0);
    for (let n = 0; n < capacity; n++, cursor++) {
      let target = circleHeatIndexes[n % circle]!;
      // A short circle heat is full; spill to the next one with room.
      for (let k = 0; buckets[target]!.length >= sizes[target]!; k++) {
        target = circleHeatIndexes[(n + k + 1) % circle]!;
      }
      buckets[target]!.push(ranked[cursor]!);
    }
  }
  for (let heat = sizes.length - circle - 1; heat >= 0; heat--) {
    for (let n = 0; n < sizes[heat]!; n++, cursor++) {
      buckets[heat]!.push(ranked[cursor]!);
    }
  }

  return buckets.map((bucket, i) => ({
    eventId,
    number: i + 1,
    lanes: placeInLanes(bucket, options.lanes),
  }));
}

/** Entries that should be seeded into an event. */
export function seedableEntries(meet: Meet, eventId: string): Entry[] {
  return meet.entries.filter((e) => e.eventId === eventId && !e.scratched);
}

export function eventHasResults(meet: Meet, eventId: string): boolean {
  return meet.results.some((r) => r.eventId === eventId);
}

export function seedEvent(
  meet: Meet,
  eventId: string,
  options: Partial<SeedOptions> = {},
  now?: Date,
): Meet {
  if (eventHasResults(meet, eventId)) {
    throw new Error("This event already has results; it can't be reseeded.");
  }
  const event = indexMeet(meet).event(eventId);
  if (!event) throw new Error("Unknown event.");
  if (event.kind === "dive")
    return drawDiveOrder(meet, eventId, undefined, now);
  if (event.round === "final") {
    throw new Error("Finals are seeded from prelim results.");
  }
  const heats = seedEntries(eventId, seedableEntries(meet, eventId), {
    lanes: meet.poolLanes,
    circleHeats: event.round === "prelim" ? 3 : 0,
    ...options,
  });
  return touch(
    {
      ...meet,
      heats: [...meet.heats.filter((h) => h.eventId !== eventId), ...heats],
    },
    now,
  );
}

/**
 * Draw a diving event's order. Divers go in one flight; `lane` is their
 * place in the order. Pass `random` for a reproducible draw.
 */
export function drawDiveOrder(
  meet: Meet,
  eventId: string,
  random: () => number = Math.random,
  now?: Date,
): Meet {
  if (indexMeet(meet).event(eventId)?.kind !== "dive") {
    throw new Error("That isn't a diving event.");
  }
  if (eventHasResults(meet, eventId)) {
    throw new Error("This event already has scores; the order is fixed.");
  }
  const divers = [...seedableEntries(meet, eventId)];
  for (let i = divers.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [divers[i], divers[j]] = [divers[j]!, divers[i]!];
  }
  const heats: Heat[] =
    divers.length === 0
      ? []
      : [
          {
            eventId,
            number: 1,
            lanes: divers.map((d, i) => ({ lane: i + 1, entryId: d.id })),
          },
        ];
  return touch(
    {
      ...meet,
      heats: [...meet.heats.filter((h) => h.eventId !== eventId), ...heats],
    },
    now,
  );
}

/**
 * Seed every event that has no results yet. Finals are left alone: they're
 * seeded from prelim results with `createFinals`.
 */
export function seedAllEvents(
  meet: Meet,
  options: Partial<SeedOptions> & { random?: () => number } = {},
  now?: Date,
): Meet {
  const { random, ...seed } = options;
  let next = meet;
  for (const event of meet.events) {
    if (event.round === "final" || eventHasResults(next, event.id)) continue;
    next =
      event.kind === "dive"
        ? drawDiveOrder(next, event.id, random, now)
        : seedEvent(next, event.id, seed, now);
  }
  return next;
}

export function heatsForEvent(meet: Meet, eventId: string): Heat[] {
  return meet.heats
    .filter((h) => h.eventId === eventId)
    .sort((a, b) => a.number - b.number);
}

/** Move one entry to a heat/lane, swapping with whoever is there. */
export function moveEntry(
  meet: Meet,
  entryId: string,
  to: { heat: number; lane: number },
  now?: Date,
): Meet {
  const from = meet.heats.find((h) =>
    h.lanes.some((l) => l.entryId === entryId),
  );
  if (!from) throw new Error("That entry isn't seeded.");
  const fromLane = from.lanes.find((l) => l.entryId === entryId)!.lane;
  const isDive = indexMeet(meet).event(from.eventId)?.kind === "dive";
  const maxLane = isDive
    ? meet.heats
        .filter((h) => h.eventId === from.eventId)
        .reduce((n, h) => n + h.lanes.length, 0)
    : meet.poolLanes;
  if (to.lane < 1 || to.lane > maxLane) {
    throw new RangeError(
      isDive
        ? `Dive order must be 1–${maxLane}.`
        : `Lane must be 1–${meet.poolLanes}.`,
    );
  }
  let heats = meet.heats;
  if (!heats.some((h) => h.eventId === from.eventId && h.number === to.heat)) {
    heats = [...heats, { eventId: from.eventId, number: to.heat, lanes: [] }];
  }
  const occupant = heats
    .find((h) => h.eventId === from.eventId && h.number === to.heat)!
    .lanes.find((l) => l.lane === to.lane);

  heats = heats.map((heat) => {
    if (heat.eventId !== from.eventId) return heat;
    let lanes = heat.lanes.filter(
      (l) => l.entryId !== entryId && l.entryId !== occupant?.entryId,
    );
    if (heat.number === to.heat) lanes = [...lanes, { lane: to.lane, entryId }];
    if (heat.number === from.number && occupant) {
      lanes = [...lanes, { lane: fromLane, entryId: occupant.entryId }];
    }
    return { ...heat, lanes: lanes.sort((a, b) => a.lane - b.lane) };
  });
  return touch({ ...meet, heats }, now);
}
