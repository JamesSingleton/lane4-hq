import type { EventGender } from "@lane4hq/swim-core/events";
import { addEvent, type EventInput, removeEvent, touch } from "./create";
import type { Course, IdFactory, Meet, ScoringPreset } from "./model";

/**
 * One race on the program, swum by every age group. `byAge` overrides the
 * distance for an age group; `null` means that age group doesn't swim it.
 */
export type ProgramItem = {
  stroke: string;
  distance: number;
  byAge?: Record<string, number | null>;
};

export type ProgramGenders =
  | "girls_boys"
  | "boys_girls"
  | "girls"
  | "boys"
  | "mixed";

/**
 * A meet's order of events before numbering. Each item is swum by every age
 * group (youngest first) and gender (in `genders` order), so a two-gender, five-age
 * program turns one item into ten numbered events.
 */
export type Program = {
  /** Age group labels in HY3 style (`8&U`, `9-10`, `15&O`); empty = open. */
  ageGroups: string[];
  genders: ProgramGenders;
  /** Swims only; diving is always a timed final. */
  round: "timed_final" | "prelim";
  items: ProgramItem[];
};

export type MeetTemplate = {
  id: string;
  name: string;
  description: string;
  course: Course;
  scoring: ScoringPreset;
  program: Program;
};

const GENDERS: Record<ProgramGenders, EventGender[]> = {
  girls_boys: ["female", "male"],
  boys_girls: ["male", "female"],
  girls: ["female"],
  boys: ["male"],
  mixed: ["mixed"],
};

const AGE_GROUP_AGES = ["8&U", "9-10", "11-12", "13-14", "15&O"];

export const MEET_TEMPLATES: MeetTemplate[] = [
  {
    id: "high-school",
    name: "High school (NFHS)",
    description: "The 12-event NFHS order with 1 m diving, girls and boys.",
    course: "SCY",
    scoring: "dual",
    program: {
      ageGroups: [],
      genders: "girls_boys",
      round: "timed_final",
      items: [
        { stroke: "medley_relay", distance: 200 },
        { stroke: "free", distance: 200 },
        { stroke: "im", distance: 200 },
        { stroke: "free", distance: 50 },
        { stroke: "dive", distance: 1 },
        { stroke: "fly", distance: 100 },
        { stroke: "free", distance: 100 },
        { stroke: "free", distance: 500 },
        { stroke: "free_relay", distance: 200 },
        { stroke: "back", distance: 100 },
        { stroke: "breast", distance: 100 },
        { stroke: "free_relay", distance: 400 },
      ],
    },
  },
  {
    id: "age-group",
    name: "Age group (USA Swimming)",
    description:
      "8&U through 15&O: 25s for 8&U, 100s and 200 IM for 13 and up.",
    course: "SCY",
    scoring: "invitational",
    program: {
      ageGroups: AGE_GROUP_AGES,
      genders: "girls_boys",
      round: "timed_final",
      items: [
        { stroke: "medley_relay", distance: 200, byAge: { "8&U": 100 } },
        {
          stroke: "im",
          distance: 100,
          byAge: { "8&U": null, "13-14": 200, "15&O": 200 },
        },
        { stroke: "free", distance: 50, byAge: { "8&U": 25 } },
        {
          stroke: "back",
          distance: 50,
          byAge: { "8&U": 25, "13-14": 100, "15&O": 100 },
        },
        {
          stroke: "breast",
          distance: 50,
          byAge: { "8&U": 25, "13-14": 100, "15&O": 100 },
        },
        {
          stroke: "fly",
          distance: 50,
          byAge: { "8&U": 25, "13-14": 100, "15&O": 100 },
        },
        { stroke: "free", distance: 100, byAge: { "8&U": null } },
        { stroke: "free_relay", distance: 200, byAge: { "8&U": 100 } },
      ],
    },
  },
  {
    id: "summer-league",
    name: "Summer league",
    description:
      "8&U through 15-18 with 25s for the youngest, relays first and last.",
    course: "SCY",
    scoring: "dual",
    program: {
      ageGroups: ["8&U", "9-10", "11-12", "13-14", "15-18"],
      genders: "girls_boys",
      round: "timed_final",
      items: [
        { stroke: "medley_relay", distance: 200, byAge: { "8&U": 100 } },
        { stroke: "im", distance: 100, byAge: { "8&U": null } },
        { stroke: "free", distance: 50, byAge: { "8&U": 25 } },
        { stroke: "back", distance: 50, byAge: { "8&U": 25, "9-10": 25 } },
        { stroke: "breast", distance: 50, byAge: { "8&U": 25, "9-10": 25 } },
        { stroke: "fly", distance: 50, byAge: { "8&U": 25, "9-10": 25 } },
        { stroke: "free_relay", distance: 200, byAge: { "8&U": 100 } },
      ],
    },
  },
];

export function meetTemplate(id: string): MeetTemplate | undefined {
  return MEET_TEMPLATES.find((t) => t.id === id);
}

/** The distance an age group swims for an item, or null if it doesn't. */
export function itemDistance(
  item: ProgramItem,
  ageGroup: string | undefined,
): number | null {
  if (ageGroup != null && item.byAge && ageGroup in item.byAge) {
    return item.byAge[ageGroup] ?? null;
  }
  return item.distance;
}

/** Number a program's events in order, starting at `firstNumber`. */
export function expandProgram(program: Program, firstNumber = 1): EventInput[] {
  const ages: (string | undefined)[] =
    program.ageGroups.length > 0 ? program.ageGroups : [undefined];
  const out: EventInput[] = [];
  let number = firstNumber;
  for (const item of program.items) {
    const dive = item.stroke === "dive";
    for (const ageGroup of ages) {
      const distance = itemDistance(item, ageGroup);
      if (distance == null) continue;
      for (const gender of GENDERS[program.genders]) {
        out.push({
          number: number++,
          distance: dive ? 1 : distance,
          stroke: item.stroke,
          gender,
          ...(ageGroup ? { ageGroup } : {}),
          round: dive ? "timed_final" : program.round,
        });
      }
    }
  }
  return out;
}

/** The first event number after every event already in the meet. */
export function nextEventNumber(meet: Meet): number {
  let max = 0;
  for (const e of meet.events) if (e.number > max) max = e.number;
  return max + 1;
}

/** Add many events at once; fails as a whole if any number is taken. */
export function addEvents(
  meet: Meet,
  inputs: EventInput[],
  options: { newId?: IdFactory; now?: Date } = {},
): Meet {
  let next = meet;
  for (const input of inputs) next = addEvent(next, input, options);
  return touch(next, options.now);
}

/** Remove many events at once; fails as a whole if any has results. */
export function removeEvents(meet: Meet, eventIds: string[], now?: Date): Meet {
  const ids = new Set(eventIds);
  const finalsFirst = meet.events
    .filter((e) => ids.has(e.id))
    .sort(
      (a, b) => (b.round === "final" ? 1 : 0) - (a.round === "final" ? 1 : 0),
    );
  let next = meet;
  for (const event of finalsFirst) next = removeEvent(next, event.id, now);
  return touch(next, now);
}
