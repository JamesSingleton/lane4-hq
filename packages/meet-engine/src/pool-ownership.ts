/**
 * Which pool runs an event in a split meet. Kept apart from `pools.ts` so the
 * functions that change a meet can check ownership without import cycles.
 */
import type { Meet, MeetEvent, Pool } from "./model";

/**
 * The pool that runs an event: a hand assignment, else its prelim's pool (a
 * final swims where its prelim did), else the pool for its gender, else the
 * first pool. Null when the meet isn't split or the event is unknown.
 */
export function eventPoolId(meet: Meet, eventId: string): string | null {
  const split = meet.split;
  if (!split) return null;
  const seen = new Set<string>();
  let event: MeetEvent | undefined = meet.events.find((e) => e.id === eventId);
  while (event) {
    const assigned = split.assignments[event.id];
    if (assigned && split.pools.some((p) => p.id === assigned)) return assigned;
    if (!event.prelimEventId || seen.has(event.id)) break;
    seen.add(event.id);
    const prelimId: string = event.prelimEventId;
    const prelim = meet.events.find((e) => e.id === prelimId);
    if (!prelim) break;
    event = prelim;
  }
  if (!event) return null;
  const byGender = split.pools.find((p) => p.genders.includes(event.gender));
  return byGender?.id ?? split.pools[0]?.id ?? null;
}

export function localPool(meet: Meet): Pool | null {
  const split = meet.split;
  return split?.pools.find((p) => p.id === split.localPoolId) ?? null;
}

/** True when this copy of the meet runs the event (always, unless split). */
export function runsEvent(meet: Meet, eventId: string): boolean {
  if (!meet.split) return true;
  return eventPoolId(meet, eventId) === meet.split.localPoolId;
}

/** Throws when another pool runs the event. */
export function assertRunsEvent(meet: Meet, eventId: string): void {
  if (runsEvent(meet, eventId)) return;
  const event = meet.events.find((e) => e.id === eventId);
  const pool = meet.split?.pools.find(
    (p) => p.id === eventPoolId(meet, eventId),
  );
  throw new Error(
    `Event ${event?.number ?? "?"} runs in the ${pool?.name ?? "other pool"}, not on this computer.`,
  );
}
