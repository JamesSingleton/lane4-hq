import type { ParsedEvent, ParsedMeet } from "@lane4hq/swim-formats";
import {
  type Course,
  type IdFactory,
  MEET_SCHEMA_VERSION,
  type Meet,
  type MeetEvent,
  randomId,
  type Scoring,
  type ScoringPreset,
} from "./model";

export const SCORING_PRESETS: Record<ScoringPreset, Omit<Scoring, "preset">> = {
  none: { individual: [], relay: [] },
  /** High school dual meet: 6-4-3-2-1, relays 8-4-2. */
  dual: { individual: [6, 4, 3, 2, 1], relay: [8, 4, 2] },
  /** Eight-lane invitational: 9-7-6-5-4-3-2-1, relays doubled. */
  invitational: {
    individual: [9, 7, 6, 5, 4, 3, 2, 1],
    relay: [18, 14, 12, 10, 8, 6, 4, 2],
  },
  /** Sixteen-place championship scoring, relays doubled. */
  championship: {
    individual: [20, 17, 16, 15, 14, 13, 12, 11, 9, 7, 6, 5, 4, 3, 2, 1],
    relay: [40, 34, 32, 30, 28, 26, 24, 22, 18, 14, 12, 10, 8, 6, 4, 2],
  },
};

export function scoringPreset(preset: ScoringPreset): Scoring {
  const points = SCORING_PRESETS[preset];
  return {
    preset,
    individual: [...points.individual],
    relay: [...points.relay],
  };
}

export type CreateMeetInput = {
  name: string;
  course: Course;
  startDate?: string;
  endDate?: string;
  location?: string;
  poolLanes?: number;
  scoring?: ScoringPreset;
};

export function createMeet(
  input: CreateMeetInput,
  options: { newId?: IdFactory; now?: Date } = {},
): Meet {
  const newId = options.newId ?? randomId;
  const now = (options.now ?? new Date()).toISOString();
  const poolLanes = input.poolLanes ?? 8;
  if (![6, 8, 10].includes(poolLanes)) {
    throw new RangeError("Pool lanes must be 6, 8, or 10.");
  }
  return {
    schemaVersion: MEET_SCHEMA_VERSION,
    id: newId(),
    name: input.name.trim() || "Untitled meet",
    startDate: input.startDate,
    endDate: input.endDate,
    course: input.course,
    location: input.location,
    poolLanes,
    events: [],
    teams: [],
    athletes: [],
    entries: [],
    heats: [],
    results: [],
    captures: [],
    heatRecords: {},
    scoring: scoringPreset(input.scoring ?? "invitational"),
    createdAt: now,
    updatedAt: now,
  };
}

function toMeetEvent(event: ParsedEvent, newId: IdFactory): MeetEvent | null {
  if (event.eventNumber == null) return null;
  const isDive = event.eventKind === "dive" || event.stroke === "dive";
  return {
    id: newId(),
    number: event.eventNumber,
    distance: event.distance,
    stroke: isDive ? "dive" : event.stroke,
    gender: event.gender,
    ageGroup: event.ageGroup,
    isRelay: event.stroke.endsWith("_relay"),
    kind: isDive ? "dive" : "swim",
    round: event.roundType === "prelim" ? "prelim" : "timed_final",
    ...(isDive ? { diveCount: event.diveCount ?? 6, diveJudges: 3 } : {}),
  };
}

/**
 * Build a meet from a host's event file (EV3/HYV, or any parsed meet with
 * numbered events). Events without numbers are skipped.
 */
export function createMeetFromEventFile(
  parsed: ParsedMeet,
  input: Partial<CreateMeetInput> = {},
  options: { newId?: IdFactory; now?: Date } = {},
): Meet {
  const newId = options.newId ?? randomId;
  const meet = createMeet(
    {
      name: input.name ?? parsed.name,
      course: input.course ?? parsed.course,
      startDate: input.startDate ?? parsed.startDate,
      endDate: input.endDate ?? parsed.endDate,
      location: input.location ?? parsed.location,
      poolLanes: input.poolLanes,
      scoring: input.scoring,
    },
    { ...options, newId },
  );
  const seen = new Set<number>();
  const events: MeetEvent[] = [];
  for (const parsedEvent of parsed.events) {
    const event = toMeetEvent(parsedEvent, newId);
    if (!event || seen.has(event.number)) continue;
    seen.add(event.number);
    events.push(event);
  }
  events.sort(compareEventOrder);
  return { ...meet, events };
}

/**
 * Meet order: prelims and timed finals by number, then the finals session.
 * A final shares its prelim's event number.
 */
export function compareEventOrder(a: MeetEvent, b: MeetEvent): number {
  const session = (e: MeetEvent) => (e.round === "final" ? 1 : 0);
  return session(a) - session(b) || a.number - b.number;
}

export type EventInput = Omit<MeetEvent, "id" | "isRelay" | "kind" | "round"> &
  Partial<Pick<MeetEvent, "round">>;

export function addEvent(
  meet: Meet,
  input: EventInput,
  options: { newId?: IdFactory; now?: Date } = {},
): Meet {
  const round = input.round ?? "timed_final";
  const isFinal = round === "final";
  if (
    meet.events.some(
      (e) => e.number === input.number && (e.round === "final") === isFinal,
    )
  ) {
    throw new Error(`Event ${input.number} already exists.`);
  }
  const event: MeetEvent = {
    ...input,
    id: (options.newId ?? randomId)(),
    isRelay: input.stroke.endsWith("_relay"),
    kind: input.stroke === "dive" ? "dive" : "swim",
    round,
    ...(input.stroke === "dive"
      ? { diveCount: input.diveCount ?? 6, diveJudges: input.diveJudges ?? 3 }
      : {}),
  };
  return touch(
    { ...meet, events: [...meet.events, event].sort(compareEventOrder) },
    options.now,
  );
}

export function removeEvent(meet: Meet, eventId: string, now?: Date): Meet {
  if (meet.results.some((r) => r.eventId === eventId)) {
    throw new Error("This event has results; it can't be removed.");
  }
  if (meet.events.some((e) => e.prelimEventId === eventId)) {
    throw new Error("Remove this event's finals first.");
  }
  return touch(
    {
      ...meet,
      events: meet.events.filter((e) => e.id !== eventId),
      entries: meet.entries.filter((e) => e.eventId !== eventId),
      heats: meet.heats.filter((h) => h.eventId !== eventId),
    },
    now,
  );
}

export function updateMeetDetails(
  meet: Meet,
  patch: Partial<
    Pick<
      Meet,
      "name" | "startDate" | "endDate" | "location" | "course" | "poolLanes"
    >
  >,
  now?: Date,
): Meet {
  if (patch.poolLanes != null && ![6, 8, 10].includes(patch.poolLanes)) {
    throw new RangeError("Pool lanes must be 6, 8, or 10.");
  }
  return touch({ ...meet, ...patch }, now);
}

export function setScoring(meet: Meet, scoring: Scoring, now?: Date): Meet {
  return touch({ ...meet, scoring }, now);
}

export function touch(meet: Meet, now: Date = new Date()): Meet {
  return { ...meet, updatedAt: now.toISOString() };
}
