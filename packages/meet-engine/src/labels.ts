import { formatEventName, formatGenderLabel } from "@lane4hq/swim-core/events";
import { formatTime } from "@lane4hq/swim-core/times";
import type {
  Athlete,
  Course,
  Entry,
  LaneResult,
  Meet,
  MeetEvent,
} from "./model";

export function poolLength(course: Course): 25 | 50 {
  return course === "LCM" ? 50 : 25;
}

/** Pool lengths in a race, e.g. 4 for a 100 in a 25-yard pool. */
export function eventLengths(event: MeetEvent, course: Course): number {
  return Math.max(1, Math.round(event.distance / poolLength(course)));
}

const ROUND_SUFFIX: Record<MeetEvent["round"], string> = {
  timed_final: "",
  prelim: " Prelims",
  final: " Finals",
};

export function eventTitle(event: MeetEvent): string {
  const age = event.ageGroup ? `${event.ageGroup} ` : "";
  const name = formatEventName(event.distance, event.stroke, event.diveCount);
  return `${formatGenderLabel(event.gender)} ${age}${name}${ROUND_SUFFIX[event.round]}`;
}

/** "A Final", "B Final", … for a finals heat; null for other heats. */
export function finalLabel(event: MeetEvent, heat: number): string | null {
  if (event.round !== "final") return null;
  const heats = event.finalHeats ?? 1;
  const rank = heats - heat;
  if (rank < 0) return null;
  return `${String.fromCharCode(65 + rank)} Final`;
}

/** "B Final" for a finals heat, otherwise "Heat 3" (or "H3" when short). */
export function heatLabel(
  event: MeetEvent,
  heat: number,
  { short = false }: { short?: boolean } = {},
): string {
  return finalLabel(event, heat) ?? (short ? `H${heat}` : `Heat ${heat}`);
}

export function athleteName(
  athlete: Pick<Athlete, "firstName" | "lastName">,
): string {
  return `${athlete.firstName} ${athlete.lastName}`.trim();
}

export function athleteNameLastFirst(
  athlete: Pick<Athlete, "firstName" | "lastName">,
): string {
  return athlete.firstName
    ? `${athlete.lastName}, ${athlete.firstName}`
    : athlete.lastName;
}

/** Hundredths display used on heat sheets and results ("NT" for none). */
export function displayTime(ms: number | null | undefined): string {
  return ms == null || ms <= 0 ? "NT" : formatTime(ms);
}

/** Truncate thousandths to hundredths, as USA Swimming rules require. */
export function toHundredths(ms: number): number {
  return Math.floor(ms / 10) * 10;
}

/** Official mark: the swim time in hundredths, or dive points; "" for none. */
export function markLabel(result: Pick<LaneResult, "dive" | "timeMs">): string {
  if (result.dive) return result.dive.total.toFixed(2);
  return result.timeMs == null ? "" : displayTime(toHundredths(result.timeMs));
}

export type MeetIndex = {
  event: (id: string) => MeetEvent | undefined;
  athlete: (id: string) => Athlete | undefined;
  entry: (id: string) => Entry | undefined;
  teamName: (code: string) => string;
  entryLabel: (entry: Entry) => string;
};

/** O(1) lookups over a meet for rendering and export. */
export function indexMeet(meet: Meet): MeetIndex {
  const events = new Map(meet.events.map((e) => [e.id, e]));
  const athletes = new Map(meet.athletes.map((a) => [a.id, a]));
  const entries = new Map(meet.entries.map((e) => [e.id, e]));
  const teams = new Map(meet.teams.map((t) => [t.code, t.name]));
  return {
    event: (id) => events.get(id),
    athlete: (id) => athletes.get(id),
    entry: (id) => entries.get(id),
    teamName: (code) => teams.get(code) ?? code,
    entryLabel: (entry) => {
      if (entry.relay)
        return `${teams.get(entry.teamCode) ?? entry.teamCode} ${entry.relay.letter}`;
      const athlete = entry.athleteId
        ? athletes.get(entry.athleteId)
        : undefined;
      return athlete ? athleteNameLastFirst(athlete) : "Unknown swimmer";
    },
  };
}
