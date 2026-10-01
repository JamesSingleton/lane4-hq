import { compareEventOrder, touch } from "./create";
import type { Meet, MeetEvent } from "./model";

export type EventPatch = Partial<
  Pick<
    MeetEvent,
    | "number"
    | "distance"
    | "stroke"
    | "gender"
    | "ageGroup"
    | "round"
    | "diveCount"
    | "diveJudges"
  >
>;

function hasResults(meet: Meet, eventId: string): boolean {
  return meet.results.some((r) => r.eventId === eventId);
}

/** Finals share their prelim's number and race, so they follow every edit. */
function withFinalsFollowing(events: MeetEvent[]): MeetEvent[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  return events.map((e) => {
    const prelim = e.prelimEventId ? byId.get(e.prelimEventId) : undefined;
    if (!prelim) return e;
    return {
      ...e,
      number: prelim.number,
      distance: prelim.distance,
      stroke: prelim.stroke,
      gender: prelim.gender,
      ageGroup: prelim.ageGroup,
      isRelay: prelim.isRelay,
    };
  });
}

function finish(meet: Meet, events: MeetEvent[], now?: Date): Meet {
  return touch(
    {
      ...meet,
      events: withFinalsFollowing(events).sort(compareEventOrder),
    },
    now,
  );
}

/**
 * Change an event before it's swum. Once an event has entries its race
 * (stroke, distance, gender) is fixed; its number, age group, and round can
 * still change. Finals follow their prelim and can't be edited directly.
 */
export function updateEvent(
  meet: Meet,
  eventId: string,
  patch: EventPatch,
  now?: Date,
): Meet {
  const event = meet.events.find((e) => e.id === eventId);
  if (!event) throw new Error("That event isn't in this meet.");
  if (event.round === "final") {
    throw new Error("Edit the prelim event; its final follows it.");
  }
  if (hasResults(meet, eventId)) {
    throw new Error(`Event ${event.number} has results; it can't be changed.`);
  }
  if (patch.round === "final") {
    throw new Error("Finals are built from prelims on the Results screen.");
  }

  const stroke = patch.stroke ?? event.stroke;
  const dive = stroke === "dive";
  const next: MeetEvent = {
    ...event,
    ...patch,
    ageGroup:
      "ageGroup" in patch
        ? patch.ageGroup?.trim() || undefined
        : event.ageGroup,
    stroke,
    isRelay: stroke.endsWith("_relay"),
    kind: dive ? "dive" : "swim",
    round: dive ? "timed_final" : (patch.round ?? event.round),
    distance: dive ? 1 : (patch.distance ?? event.distance),
  };
  if (dive) {
    next.diveCount = next.diveCount ?? 6;
    next.diveJudges = next.diveJudges ?? 3;
  } else {
    delete next.diveCount;
    delete next.diveJudges;
  }

  if (!Number.isInteger(next.number) || next.number < 1) {
    throw new RangeError("Event numbers are whole numbers from 1.");
  }
  if (!dive && (!Number.isInteger(next.distance) || next.distance < 1)) {
    throw new RangeError("Distance must be a whole number of yards or meters.");
  }
  if (
    next.number !== event.number &&
    meet.events.some(
      (e) =>
        e.id !== eventId && e.round !== "final" && e.number === next.number,
    )
  ) {
    throw new Error(`Event ${next.number} already exists.`);
  }
  const raceChanged =
    next.stroke !== event.stroke ||
    next.distance !== event.distance ||
    next.gender !== event.gender;
  if (raceChanged && meet.entries.some((e) => e.eventId === eventId)) {
    throw new Error(
      `Event ${event.number} has entries, so its stroke, distance, and gender are fixed.`,
    );
  }
  if (
    next.round !== "prelim" &&
    meet.events.some((e) => e.prelimEventId === eventId)
  ) {
    throw new Error("Remove this event's finals first.");
  }

  return finish(
    meet,
    meet.events.map((e) => (e.id === eventId ? next : e)),
    now,
  );
}

/**
 * Girls' and boys' events that are the same race (stroke, distance, age
 * group, round), paired in number order. Finals are left out; they follow.
 */
export function genderPairs(meet: Meet): [MeetEvent, MeetEvent][] {
  const groups = new Map<string, { female: MeetEvent[]; male: MeetEvent[] }>();
  for (const e of meet.events) {
    if (e.round === "final" || e.gender === "mixed") continue;
    const key = `${e.stroke}|${e.distance}|${e.ageGroup ?? ""}|${e.round}`;
    let group = groups.get(key);
    if (!group) {
      group = { female: [], male: [] };
      groups.set(key, group);
    }
    group[e.gender].push(e);
  }
  const pairs: [MeetEvent, MeetEvent][] = [];
  for (const { female, male } of groups.values()) {
    const n = Math.min(female.length, male.length);
    for (let i = 0; i < n; i++) pairs.push([female[i]!, male[i]!]);
  }
  return pairs.sort((a, b) => a[0].number - b[0].number);
}

/** Which gender swims first across the meet's paired events, if consistent. */
export function genderOrder(meet: Meet): "girls" | "boys" | "mixed" | null {
  const pairs = genderPairs(meet);
  if (pairs.length === 0) return null;
  const girlsFirst = pairs.filter(([f, m]) => f.number < m.number).length;
  if (girlsFirst === pairs.length) return "girls";
  if (girlsFirst === 0) return "boys";
  return "mixed";
}

/**
 * Swap the numbers of every girls/boys pair, so the gender that swam first
 * now swims second. Entries, heats, and finals stay with their events.
 */
export function swapGenderOrder(meet: Meet, now?: Date): Meet {
  const pairs = genderPairs(meet);
  if (pairs.length === 0) {
    throw new Error("There are no girls' and boys' events to swap.");
  }
  const swapped = new Map<string, number>();
  for (const [female, male] of pairs) {
    if (hasResults(meet, female.id) || hasResults(meet, male.id)) {
      throw new Error(
        `Events ${female.number} and ${male.number} have results; their numbers are locked.`,
      );
    }
    swapped.set(female.id, male.number);
    swapped.set(male.id, female.number);
  }
  return finish(
    meet,
    meet.events.map((e) => {
      const number = swapped.get(e.id);
      return number == null ? e : { ...e, number };
    }),
    now,
  );
}

/** True when events aren't numbered 1, 2, 3… in meet order. */
export function hasNumberGaps(meet: Meet): boolean {
  let expected = 1;
  for (const e of meet.events) {
    if (e.round === "final") continue;
    if (e.number !== expected) return true;
    expected++;
  }
  return false;
}

/** Number events 1, 2, 3… in their current order, closing gaps. */
export function renumberEvents(meet: Meet, now?: Date): Meet {
  let number = 1;
  const events = meet.events.map((e) => {
    if (e.round === "final") return e;
    const next = number++;
    if (next !== e.number && hasResults(meet, e.id)) {
      throw new Error(
        `Event ${e.number} has results; renumbering would change it.`,
      );
    }
    return next === e.number ? e : { ...e, number: next };
  });
  return finish(meet, events, now);
}
